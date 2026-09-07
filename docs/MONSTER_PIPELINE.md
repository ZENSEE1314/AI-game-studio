# Monster Pipeline

## Current studio flow

Create a creature in Monster lab, supply name/element/HP/attack/personality, move Draft → Review → Approved, and export JSON. Approval is a local editorial label, not an automated quality check. The current three SVG illustrations are reusable concepts, not finished species art.

## Production flow

1. Brief: habitat, emotional hook, silhouette, element, gameplay role and original visual references.
2. Design draft: validate against `schemas/monster.schema.json`; assign a stable ID.
3. Concept art: front/side/back views with scale, palette and material notes. Record author/provider, generation settings, licensing and revision.
4. Review: check originality, readability, lore continuity, balance and accessibility.
5. Model/rig: consistent scale, named bones, optimized geometry and source files.
6. Animate: required clip set from ANIMATION_PIPELINE.md.
7. Integrate: content revision, asset references, fallback art, preview build.
8. Release: approved manifest with review record. Never deploy AI output directly from generation.

## Naming

`creature_id/revision/source/`, `creature_id/revision/runtime/`, `creature_id/revision/review.md`. IDs remain stable when display names change.

## Rejection handling

Return a specific change request to the owning discipline. Preserve prior revisions. Do not silently regenerate approved stats when an image changes.
