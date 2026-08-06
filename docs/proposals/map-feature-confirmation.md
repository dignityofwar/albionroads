# Proposal: machine-derived map features, confirmed by humans

**Status:** phase 1 shipped, phase 2 started. **Last updated:** 2026-08-02.

Today a room's map features are whatever a human typed while standing in the zone, usually under
time pressure in a lethal area. This proposes inverting that: publish a machine-derived baseline
for every zone we can, and use humans to *confirm or correct* it rather than to author it.

The work splits in two. **Phase 1** corrects the catalogue against the evidence and makes it
regenerable, so there is something trustworthy to present. **Phase 2** presents it and collects
confirmations. Phase 1 shipped on 2026-08-01; everything below the "What shipped" section is
phase 2 and is still a proposal.

## What shipped (2026-08-01, PR #62)

Merged as `010a2e9` and deployed to production the same day.

- **Three duplicate zones resolved.** `Secent-Al-Odetis`/`-AI-`, `Hiles-Izizaum`/`Files-`, and
  `Brecilien`/`Brecillien` were each in the catalogue twice. Migrations `026` and `027` rewrote the
  dead ids across rooms, connections, chains, positions and memory.
- **The catalogue is regenerable again.** Hand-curated data that only existed in the committed file
  — the `Brecilien` entry, which no feed carries and which is a live room's home zone, and
  `proximityTo` on 34 outlands zones — now lives in `map-parser/scripts/manualMaps.ts`
  (`MANUAL_MAPS` for whole entries, `MAP_OVERRIDES` for fields patched onto upstream entries).
  Before this, a clean sync silently deleted both, so the file had drifted from its own generator.
- **Shape corrections:** `Setos-Avamsum` is an `s` zone rather than an Avalonian Rest, and
  `Cynitos-Atatlum` is an `o`. Both moved into `SHAPE_OVERRIDES` in `ZoneNameParser`, where a
  resync cannot revert them.
- **Caerleon RC** categorisation for the 11 red zones ringing Caerleon, plus `Snapshaft Trough`,
  which was losing its Bridgewatch RC category the same way.
- **113 zones stopped dropping their leather** — the feed's `HIRE` spelling of hide is now aliased.
- **Dungeon fields were missing from the `room_node_memory` allowlist** and were being silently
  discarded on every write.
- **`tools/map-analysis/`** — the shape/rotation reader and the history-vs-reference audit, with
  the acquisition side stripped out.

Catalogue went 817 → 815 zones. Royal Continent, Outlands and Brecilien unchanged in count and
type; every difference was in Roads.

### What phase 1 did *not* deliver

The per-zone feature counts — "we believe this zone has 6 green chests and 2 wood" — are still not
in the catalogue, because they need the icon reader that phase 2 depends on. Phase 1 corrected the
*identity* of every zone (name, type, shape); it did not add the contextual detail.

## Phase 2 so far: the icon reader (2026-08-02)

`tools/map-analysis/map_icons.py` reads chests, resource nodes and dungeon entrances off a map
screenshot. It found a frame on all 325 cached maps and read 3,395 icons; two of those maps are
zoomed far enough that the frame is unusable and they yield nothing.

Agreement with the tabulated reference, **counted only over zones where one side or the other says
the feature is present**. That restriction matters: only about a third of zones have any given
resource, so scoring all 325 would count every zone with no ore as an ore success and turn the
figures below into high nineties across the board.

| feature | agree / present | | feature | agree / present |
|---|---|---|---|---|
| ore | 101/105 (96%) | | stone | 111/116 (96%) |
| leather | 106/113 (94%) | | wood | 114/124 (92%) |
| green chests | 280/308 (91%) | | fibre | 110/122 (90%) |
| blue chests | 160/178 (90%) | | yellow chests | 89/101 (88%) |
| **dungeons** | **114/195 (58%)** | | | |

Dungeons are the outlier and the reason the reader is not yet a baseline anyone should ship.

**These are in-sample figures**, on two counts. Seven per-type thresholds were swept against this
same reference, and the exemplars the templates are averaged from are crops out of these same
screenshots.

The threshold half of that was checked: tune on alternate zones, score the other half, then swap.
Scoring half B with thresholds tuned on B gives 82.3% against 80.6% with thresholds tuned on A;
scoring half A gives 87.2% against 87.5% the other way. So fitting the thresholds to the zones
they are then scored on is worth about **0.7 points on average** — the two halves differ far more
from each other (80.6 vs 87.5) than either differs from its own tuning. The thresholds themselves
land in near-identical places on both halves. They are not carrying the result.

The template overlap is not controlled for at all: 229 of the 325 zones contributed exemplar crops.
So treat the table as "the reader and the reference mostly say the same thing", not as an accuracy
measurement against truth.

Four things it established that the plan did not know:

- **The small/large resource split is readable after all,** and it is the clearing the node stands
  in, not the sprite. Normalised against each map's own terrain coverage the two populations
  separate cleanly. On 74 zone/resource pairs where two or more independent rooms agreed a non-zero
  split, the reader gets both numbers right on 68 — and **every failure is a count disagreement,
  never a sizing one: where the count is right the split is right 68 times out of 68.** So the
  confirmation schema's per-line small/large numbers have a machine baseline rather than only a
  human one, and its weak point is counting rather than sizing.
- **Correlation alone cannot tell the three chests apart.** They share one sprite body and differ
  only in lid colour, which normalised cross-correlation removes along with the mean. Matching the
  shape once and taking the colour from lid hue — gold 42°, green 88°, blue 190°, tightly clustered
  and far apart — took blue chests from 32 read to 194 and yellow from 6 to 176. A lid too washed
  out to take a hue from is counted as green and the zone is flagged, since silently guessing would
  bias green upward against the other two; across 1,486 chests that has not yet happened once.
- **The reference and the images disagree about dungeons, in the reference's favour by 69.** It is
  not a threshold problem — the count is flat from 0.60 to 0.85. Whether that is a second dungeon
  sprite the reader has no template for, or the reference over-reporting, is not settled: the one
  case checked by eye, `Casos-Aximam`, is tabulated at 2 and its map draws 1. It needs settling
  before dungeons go into a baseline, and it is the largest single block of the review queue.
- **Both known under-counts were occlusion, not detection.** `Huritos-Oiaelos` has a hover tooltip
  drawn over the map hiding icons; `Tebitos-Odoxlum` is zoomed far enough that the frame runs off
  the screenshot. Both are flagged now — a straight horizontal edge longer than 70 reference pixels
  is a UI panel, which terrain does not produce at that length in this corpus.

The reader stays out of the build, like the rest of `tools/map-analysis`. Templates are averaged
from labelled exemplar coordinates in `icon-labels.json` rather than committed sprite images, the
same arrangement `road_shapes.py` uses for its shape baselines. The screenshots, the tabulated
reference and the results are all uncommitted, so none of the figures above can be reproduced from
this repository alone — the reviewed dataset is what fixes that, and it is the next task.

## Tasks

Phase 2, in rough dependency order.

- Settle the dungeon disagreement — 69 dungeons the reference has and the images do not. Establish
  whether a second dungeon sprite exists that the reader has no template for, or the reference
  over-reports. Blocks putting dungeons in the baseline at all.
- Review the 136 flagged zones and produce the reviewed per-zone reference dataset, then commit it;
  keep acquisition tooling and cached images out of the repo. The reader's own output is not the
  dataset — every zone where it disagrees with the tabulated reference needs a human to say which
  of the two is right, and the dungeon disagreements are the bulk of them.
- Decide what the baseline says for the 2 zones the reader cannot read at all and the 21 that have
  no data of any kind.
- Add feature counts to `GameMap`, `GameMapSchema`, the `Zone` interface and the shared adapter —
  all four, since the adapter currently drops everything the runtime does not already use.
- Re-run the human-history audit without collapsing `dungeonStatic`/`dungeonGroup` into one count
  and without summing each resource's `small` and `large`. Blocks the migration: today's headline
  figures do not measure the granularity the confirmation model stores.
- Design and build the confirmation/difference schema and its migration from `room_node_memory`.
  Both record types store the baseline values they were measured against; confirmed zero is
  distinct from never-checked; migrated and imported rows carry their provenance.
- Rebuild the per-feature confirmation UI: greyed prefilled value, one confirm checkbox per line
  (green/blue/yellow chests, static/group dungeons, and each resource type covering its small and
  large together), correction path, and the ability to add features the baseline does not know
  about. Fix the editor so a count of zero is storable rather than deleting the value.
- Write the batch job that enumerates per-(zone, feature) records, compares them against the machine
  baseline, and reports corroborated disagreements for review. Reporting only — nothing acts on its
  output automatically in the first build.
- Implement the promotion rule and a review queue for corroborated corrections.
- *Later session, not now:* derive a corrected value from accumulated deviation data and present it
  as a suggestion. Needs a body of deviation data that does not exist yet.
- Retire `parseGuaranteedContent`'s chest-suffix rule and the first-letter shape rule once each
  clears its bar. The shape rule now has a much stronger case for staying — see below.
- Stop `syncMaps.test.ts` duplicating the script's logic. Partly done: the local copy of
  `EXCLUDED_MAP_NAMES` is gone, having already drifted and hidden a genuine failure.
  `extractResources`, `classify` and `processEntry` are still re-implemented in the test file.
- Research how Avalonian and group dungeons spawn specifically in Roads zones.

Done in phase 1: ~~resolve the shape disagreements~~, ~~decide the `maps.json` drift question~~.
Done in phase 2: ~~build the icon reader~~, ~~filter overlay noise from icon detection~~,
~~investigate the two under-counts~~.

## Why

Two zone properties are inferred from the zone's *name*: map shape from the first letter, and
treasure chest type from the last segment (`-los`/`-am`/`-un`). Both rules came from a community
wiki page now believed inaccurate. Measured against evidence:

- The chest-suffix rule disagrees with observed map icons on **21 of 93** roads zones.
- The first-letter shape rule was wrong on **2** zones (`Cieos-Atatlum`, `Cynitos-Atatlum`, both
  ring-shaped despite `C` names). Both are now hardcoded overrides — a rule needing a growing
  exception list is a rule that should be replaced by measurement.

Meanwhile, an image-derived reading of the same zones matches the committed catalogue on **99.6%**
of shapes and, on the 412 zone/feature pairs where two or more rooms independently agreed, matches
human observation **411 times**.

The shape rule survived its full audit: every zone whose layout the matcher could not place
confidently — 23 of them — was checked against the game, and 22 were already correct. So the rule
is not the weak part of the catalogue, and the remaining shape work is a matter of confidence
rather than correctness.

**Duplicate zones are the failure this uncovered instead.** Three zones were in the catalogue twice
under near-identical spellings, each pair differing by one letter that is ambiguous in the game's
font: `Secent-Al-Odetis`/`-AI-`, `Hiles-Izizaum`/`Files-`, and `Brecilien`/`Brecillien`. Each one
split rooms' history across two ids and, in the `Hiles` case, presented as a wrong map shape —
the `F` spelling inherits an `f` layout from its first letter. A sweep for same-suffix, same-tier
names within one edit of each other finds no others.

## Evidence

Human map history: 1,078 genuine observations (excluding app prefill) across 374 zones.

| check | result |
|---|---|
| baseline vs all human observations | 96.9% roads, 97.8% hideout |
| baseline vs zones where 2+ rooms agreed | **363/364 roads, 48/48 hideout** |
| observations where humans disagree with baseline | 5.3% |
| direction of those disagreements | overwhelmingly human **under**-counts |

**These figures are measured at a coarser granularity than the model above stores.** The audit
script sums `dungeonStaticCount` and `dungeonGroupCount` into a single `dungeonCount`, and sums a
resource's `small` and `large` into a single per-type number. So the 412 pairs validate "how many
dungeons" and "how much wood", not the per-line keys phase 2 records. They are strong evidence that
image-derived data beats name-derived data, and they are **not** evidence that the split values are
right. Re-running the audit without those two collapses is a prerequisite for the migration below,
not a nicety — it is the only thing that can tell us whether the small/large split and the
static/group split survive contact with human observation.

One spot-check is worth recording because it splits the two candidate sources apart. On
`Secent-Al-Odetis` an in-game reading gives 5 green chests, 1 blue chest and 1 small rock. The
tabulated reference gives 5 green and 1 stone and **no blue chest at all**; the screenshot shows
the blue chest plainly. So the counts in the reference table are reliable but its chest *colours*
are not complete — the argument for reading the images rather than the table that describes them.

Where several humans disagreed with each other, the baseline matched the majority and the outlier
was almost always the low reading — e.g. one zone recorded as 1, 3, 4, 4 where the baseline says 4.
This is the counting-under-fire problem the proposal exists to solve.

### Coverage

| | hideout | non-hideout roads | all roads |
|---|---|---|---|
| zones | 102 | 304 | 406 |
| image baseline | 60 (59%) | 267 (88%) | 327 (81%) |
| human observations | 69 (68%) | 226 (74%) | 295 (73%) |
| **either** | **91 (89%)** | 293 (96%) | **385 (95%)** |
| neither | 11 | 10 | 21 |

Hideouts are not a special case: every hideout image that exists yields features, and the baseline
has never lost to a hideout consensus (48/48).

Coverage was measured before the duplicate removal, against 406 roads zones rather than today's
404. The two zones removed were duplicates of zones already counted, so the percentages hold.

## Model

Everything below is per **(zone, feature)** — never per zone. A zone is not one fact but several
independent ones, and they are not equally reliable:

| counting | observations | error rate |
|---|---|---|
| 1 of something | 930 | **0.5%** |
| 2 | 244 | 4.9% |
| 3 | 87 | 13.8% |
| 6 | 41 | 12.2% |
| 8 | 17 | 11.8% |

Error rises roughly twentyfold once the count exceeds one. Per feature, green chests run 6.2% error
(they come in large groups) against 0.6% for wood. So in a zone with six green chests and one blue,
the blue is near-certain and the green is the doubtful part — and discarding the zone's data because
of the green would throw away the blue with it. Confirmations, differences and any later aggregate
are therefore all keyed by (zone, feature).

**Baseline** — per zone, the machine-derived permanent features with counts: chests by colour,
resources with small/large split, dungeon markers. Lives in the committed catalogue.

**What a feature key is: one key per line the interface draws.** The editor already renders these
as separate rows with their own icons, and each row gets its own checkbox:

| line | independently held numbers |
|---|---|
| green chests | count |
| blue chests | count |
| yellow chests | count |
| static dungeons | count |
| group dungeons | count |
| each resource type — wood, ore, stone, fibre, leather | small **and** large |

Chest colours and dungeon types are never confirmed as one lump: green chests run 6.2% error and
blue is near-certain, so collapsing them would make the doubtful number contaminate the reliable
one. Resources are the one line carrying two numbers — small and large are stored independently
but confirmed together, because the person is looking at one resource line and answering one
question about it. So a wood line confirms "2 small, 0 large" as a single statement.

Dungeons currently carry both a boolean flag and a count for each type. Phase 2 needs one of them
to be the evidence; the flag exists only because counts came later.

**Per room + zone, store only what a human said about the baseline:**

- a **confirmation** — this feature checked, correct, *and the baseline values it was checked
  against*
- a **difference** — the human's values *and* the baseline values they were recorded against

Both record the baseline they were measured against, for the same reason: once the baseline is
corrected from aggregated evidence, a record that stored only "user said 2" — or only "user said
correct" — silently re-interprets itself against a baseline it was never measured against. A
confirmation of 4 must not become a confirmation of 5 because the catalogue moved underneath it.

**Zero is a value, not an absence.** "2 small, 0 large" is a real confirmed observation and has to
be storable as one. The current editor cannot represent it — setting a count to zero deletes the
key, and zero on both sizes deletes the resource entirely — so phase 2 has to separate "confirmed
zero" from "never checked" in both the schema and the editor. With per-resource-line confirmation
this is load-bearing rather than an edge case: a resource line with one size present is asserting
zero for the other.

**Zones with no baseline** (21 today) take absolute values, which become a candidate baseline once
corroborated.

Transient state — power cores, timed chests, reds, crystal creature — is not baseline-able and
stays exactly as it is today. The `room_node_memory` allowlist already draws roughly this line.

### Scope of the first build

**The value shown to users comes from machine data only.** Pull it out of the catalogue, present it,
collect confirmations and differences. That is the whole of the first build, and it is simple —
no inference, no aggregation on the read path.

Deriving a *corrected* value from accumulated user submissions — "based on reports we now think this
area has 5, please confirm" — is explicitly **out of scope for now** and belongs in a later session,
once enough deviation data exists to be worth reasoning over. Building it before there is data to
learn from would be inventing an answer to a question nobody has asked yet.

The bridge between the two is a batch job, not a read-path feature: a periodic script that
enumerates the per-(zone, feature) records, compares them against the machine baseline, and reports
where corroborated evidence disagrees. It is arithmetic over a table, cheap to run and easy to
verify, and it can exist long before anything acts on its output automatically.

### Promotion rule

Two independent rooms agreeing has never contradicted the image baseline across 412 checks. So:

- a **single** differing report does not move the baseline — most are undercounts
- **two or more independent rooms agreeing on the same different value** flags the zone for review,
  and is the trigger for reporting a correction upstream
- the same room re-confirming its own zone counts once

A room is not a person. One operator can hold several rooms, a guild can propagate one mistaken
reading across all of theirs, and imported history duplicates observations wholesale. "Two
independent rooms" is therefore a review trigger, not an independence proof — which is tolerable
precisely because nothing promotes automatically. Before that changes, the rule needs to say how
imported and migrated rows count, if at all.

### Migrating the existing table

The current `room_node_memory` feature data should be migrated, not dropped — but it does not
convert as cleanly as the row counts suggest, and the classification rules have to be written down
and reproducible before the migration runs:

| existing rows | becomes |
|---|---|
| 1,418 values matching the baseline (237 zones) | confirmations |
| 80 values differing (53 zones) | differences — seeds the correction table |
| 297 values with no baseline | absolutes |
| 983 app prefills never touched by a human | discarded; these were never observations |

That is a year of user effort that cannot be regenerated, and it arrives as a populated correction
table on day one. Four things complicate it, and each needs a stated rule:

- **The table is a snapshot, not a log.** A whole-graph position save rewrites a room's memory row,
  so a later edit can overwrite an earlier observation. What migrates is the last state, not the
  history — the row counts are an upper bound on distinct observations.
- **Catalogue prefills are written straight into it.** Room creation stores `getInitialFeatures()`
  into `room_node_memory`, so prefills are present from the moment a room exists. The
  `upstreamFeatures` marker is what distinguishes them and the migration must honour it — that
  marker is the only thing standing between a prefill and a fabricated confirmation.
- **Imports recreate client-supplied history verbatim.** Room import inserts whatever `roomHistory`
  the client sends. Imported rows are indistinguishable from observed ones unless provenance is
  recorded, so they need excluding from promotion or marking at migration time.
- **Migrated rows carry no baseline.** They were recorded against whatever the catalogue said then.
  They should migrate with the baseline recorded as unknown rather than as today's value, and be
  ineligible to trigger a promotion on their own.

## UX

Per **feature**, not per zone. A global "is all of this correct?" invites a reflexive yes; a
checkbox beside each individual value asks a question the person can answer by looking at it. The
error table above is the argument: the doubtful part of a zone is one specific number, so that is
the granularity the question has to be asked at.

- prefilled values render greyed with an unconfirmed badge
- each has its own confirm control, and its own correction path if the value is wrong
- **resources get one checkbox per resource line**, covering that resource's small and large counts
  together. The two numbers are edited independently and stored independently; ticking the line
  asserts both at once, including a zero on either side
- humans can still add features the baseline does not know about — including things the baseline
  can never know, such as whether a dungeon is currently open

The existing `upstreamFeatures` mechanism already marks a value unconfirmed and clears that mark
when a human edits it, so the concept exists; this extends it to carry counts and an explicit
confirm action. It already tracks resources by type rather than by type-and-size, which is the
granularity the resource-line checkbox needs — but it currently clears on an edit to *either* size,
so the mark and the confirmation have to become one deliberate action rather than a side effect.

Permanent and transient state share one `NodeFeatures` object today — counted chests sit alongside
power core timers and the crystal creature flag. Only the permanent half is evidence, and the split
has to be explicit in the confirmation schema so a transient toggle can never be read as a
correction to the catalogue.

## Risks and limits

- **Anchoring.** Some users will tick without checking. Structurally contained: a lazy tick can only
  agree with a baseline that is already 97–100% likely to be right, and confirmations never move a
  baseline — only corroborated corrections do. *Optional, not agreed:* withhold the prefill on a
  small random fraction of zone loads to measure blind-vs-prefilled disagreement rather than
  assuming it is small.
- **Icon detection is no longer unproven, but it is not yet proven either.** It is measured on the
  same corpus its templates were learned from and against a reference that is itself wrong in
  places, so the phase 2 figures are agreement rather than accuracy. Dungeons at 58% are the part
  that is actually failing. Two smaller ones: the reader is only as reproducible as the screenshots
  it learned from — the exemplar coordinates in `icon-labels.json` point into specific cached
  images — and transient icons other than portals and the hideout marker have no template, so they
  are rejected on score alone rather than recognised and set aside.
- **21 zones have no data of any kind** and stay blind-entry, plus 3 the reader cannot locate.
- **Acquisition is not reproducible in CI** by design — the reviewed reference dataset is committed,
  the tooling and cached images are not.
- Socket counts are currently written to `maps.json` but **read by nothing at runtime**; the shared
  adapter drops them. Verifying them is informational until something consumes them.
- **Duplicate zones will recur.** The feed has produced three, each from one ambiguous letter, and
  the sweep that found them is not automated. A fourth would arrive as a wrong map shape rather
  than as an obvious duplicate, which is the misleading part. Worth a test over the generated
  catalogue rather than a memory of having checked once.

## Delivery notes

Phase 2 changes `room_node_memory`, so it will need migrations too. What phase 1 established about
how those actually reach production:

- **Migrations run themselves.** `initDb()` in `web/server/src/db.ts` runs `node-pg-migrate` on
  server boot, before the app is built, and exits the process on failure. Nothing in the deploy
  script or the compose file runs them, and nothing needs to — which is easy to misread as nobody
  running them at all.
- **A failed migration fails the deploy** rather than half-applying. The container exits, never
  passes its healthcheck, and the deploy blocks on that healthcheck.
- **The rehearsal that is worth repeating:** restore a production dump into the testing database,
  scrub every room's password hash to one throwaway value, then restart the testing container and
  let it migrate. A dump carries `pgmigrations`, so the restore rewinds testing to production's
  exact migration state and the pending migrations then run against real rows. Phase 1 used this to
  prove `026` and `027` on the actual affected data before merging.
- **The check that settles it** is an orphan audit: collect every distinct zone id referenced across
  memory, positions, home zones, chain sources and both ends of every connection, and diff against
  the catalogue. Phase 1 ran this on production after deploy — 533 ids in use, zero orphans.
- The catalogue is bundled into the client as well as the server, and the client deploys
  independently, so a browser tab loaded before a deploy holds the old ids until it reloads.

## Prior review

An adversarial review of the earlier version of this plan returned RETHINK. Three of its objections
are addressed here: the missing count-propagation path through `Zone` and the adapter is now called
out; the backfill problem disappears because rooms no longer hold a copy of baseline features; and
the reviewed-dataset-plus-deterministic-join structure replaces image processing inside the
generator. Its objection to the acceptance bar is superseded — a confirmation system discovers its
own errors in production rather than needing them proven absent beforehand — but that reasoning
does **not** extend to irreversible steps: retiring the name heuristics and regenerating the
catalogue still need the drift settled first.

A second review, of the phase 2 model above, also returned RETHINK. Its strongest objection was
that confirmations stored only "correct" while differences stored their baseline — the document
argued the re-interpretation case for one and not the other. That is fixed above, along with the
audit-granularity claim, explicit zero, prefill and import provenance, and the confirm-key
definition. Four of its objections are accepted but deferred to the build rather than the plan:
per-icon precision/recall bars for the reader; an atomic uniqueness rule for concurrent
confirmation, since memory writes currently happen outside the room lock's transaction;
non-negative-integer schema validation, as counts are unconstrained `z.number()` behind a
`.passthrough()`; and an expand/contract compatibility period so a rollback after a successful
migration is safe. It was wrong that the plan retires `room_node_memory` — the table keeps
`times_added`, handles, rotation and import state, and only the feature evidence moves off it.
