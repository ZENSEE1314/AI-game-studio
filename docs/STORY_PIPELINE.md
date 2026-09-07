# Story Pipeline

Inputs: Game Bible, Story Bible, existing quest flags and approved creature lore. Output: one versioned quest script and a continuity review.

Each quest specifies ID, chapter, prerequisites, objectives, dialogue nodes, completion event, unique reward key and next-quest links. Node IDs are stable; player-visible text is separate for localization.

Workflow: outline → beat review → dialogue draft → branch validation → localization preparation → playable integration → QA. Check unreachable nodes, loops without exits, rewards granted twice, missing prerequisites and unsupported assumptions about the player's identity or travel.

AI-assisted drafting, when connected, receives the minimum relevant approved context. Generated text is untrusted draft content, never a tool instruction. A reviewer approves changes to established world rules. Current Story room is a Markdown editor; quest execution and AI drafting are not implemented.
