# Anti-cheat Plan

The local prototype is intentionally editable and provides no anti-cheat guarantees.

For production, treat the client as untrusted. Server-authorize encounter starts, quest completion and inventory writes. Deduplicate action and reward IDs, reject impossible turn sequences, enforce content revisions and rate limits, and prevent replay across accounts.

Walking heuristics should flag anomalies, not automatically punish users. Distinguish sensor faults, accessibility devices and offline replay from abuse. Prefer limiting suspicious rewards pending review to irreversible bans. Keep a minimal audit trail and provide appeal and recovery procedures. Never infer precise trusted travel from a single client sensor reading.
