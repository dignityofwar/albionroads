# Map analysis tools

Three throwaway-but-kept Python scripts for checking zone data against evidence
rather than assumption. None is part of the build; run them by hand when a
question comes up.

Requires `numpy` and `pillow`.

## `road_shapes.py` — layout and rotation from a screenshot

Reads the road overlay out of a map screenshot, deskews it using the stone frame,
and matches it against a per-shape baseline at all four rotations. Answers "what
shape is this zone, and which way round is it", and flags anything that doesn't
match cleanly instead of guessing.

```bash
python3 road_shapes.py --maps ./screenshots --labels ./labels.json
```

`--labels` is `{"Zone-Name": "s", ...}` for zones whose shape is already known —
baselines are learned from those rather than hardcoded, so the tool needs a
labelled set before it can judge an unknown one. Screenshots are `<Zone-Name>.png`.

Output per zone: shape, rotation in 90° clockwise steps, a 0–1 match score, the
runner-up shape, and a `needsReview` note when the match is weak, a close call, or
disagrees with the supplied label.

Known limitation: it identifies the road network only. For the icons on top of
it, see `map_icons.py`.

## `map_icons.py` — chests, resources and dungeons from a screenshot

Finds the permanent feature sprites on a map and names them, giving the per-zone
counts the confirmation model needs as its baseline. A sprite has to survive road
masking as a bright connected component to be considered at all, so anything
covered by a UI panel or drawn over a road can be missed outright.

```bash
python3 map_icons.py --maps ./screenshots --labels ./icon-labels.json \
                     --reference ./reference.json
```

`icon-labels.json` holds exemplar coordinates per feature type; templates are
averaged from those rather than hardcoded, the same arrangement `road_shapes.py`
uses for its shape baselines. The coordinates point into the screenshots, so
re-acquiring the images can invalidate them — check a handful by eye if the
counts move.

`--reference` is optional. Supplying it prints a per-type agreement table and
adds every disagreement to that zone's review notes. Agreement is counted only
over zones where one side or the other says the feature is present — scoring all
325 would count every zone that has no ore as an ore success, and most of them
have none.

Output per zone: the feature summary (`chests`, `resources` with a small/large
split, `dungeonCount`), every icon with its position and match score, and a
`needsReview` list. Zones are flagged when the frame was found but failed its
quality check, when a UI panel covers part of the map, when a chest's lid was too
washed out to take a colour from, or when an icon matched two types too closely
to call. A map whose frame cannot be found at all is skipped with no entry, so
check the skipped count as well as the flags.

Portals and the hideout marker have templates purely so they stop being mistaken
for features. Everything else that is not baseline-able — power cores, the
crystal creature, the player arrow, the hunt ring — has no template and is
rejected on score alone, which is the weaker of the two mechanisms.

## `feature_audit.py` — human map history vs a reference set

Compares `room_node_memory` against reference feature counts and reports both how
often humans match the reference and **how much humans disagree with each other**
about the same zone. The second column is the one that distinguishes bad data from
genuinely dynamic content, and it works even with no reference file at all.

```bash
psql "$DATABASE_URL" -At -c "SELECT json_agg(t) FROM (
    SELECT rnm.zone_id, rnm.features, r.server
    FROM room_node_memory rnm JOIN rooms r ON r.id = rnm.room_id
    WHERE rnm.features IS NOT NULL) t;" > history.json

python3 feature_audit.py --history history.json --reference reference.json
```

`reference.json` is keyed by zone id:

```json
{ "cases-ugumlos": { "chests": { "treasuresGreenCount": 6 },
                     "resources": { "leather": 2 },
                     "dungeonCount": 1 } }
```

Values a row lists in `upstreamFeatures` are prefill rather than observation and
are excluded — otherwise the audit compares the prefill against its own source and
reports a suspiciously perfect score.

The strongest signal it prints is the last section: zones where two or more humans
independently agreed, checked against the reference. Those are the cases where a
mismatch means the *reference* is wrong.
