# AI Game Studio — Agent Instructions

## Objective

Build Form & Fable, a studio workspace, and develop the Echobound sample game into a validated playable experience. The user has not yet confirmed the final game concept. Preserve that distinction.

## Read first

README.md, GAME_BIBLE.md, STORY_BIBLE.md, docs/ARCHITECTURE.md and the role file in agents/ relevant to your task. Existing user decisions outrank sample concepts.

## Working rules

- Inspect current files and git status before editing. Preserve unrelated changes.
- Deliver a working, bounded increment with explicit acceptance criteria.
- Keep claims of implemented behavior separate from plans and mock data.
- Store credentials only in a server-side secret manager or ignored environment file. Never place them in Vite client variables.
- Treat generated content as a draft. Validate structured output and keep provenance before approving it for release.
- Do not let game clients determine authoritative rewards, inventory or payment outcomes in production.
- Use original characters and licensed assets; record source and usage rights.
- Do not record precise player location until a reviewed design requires it.
- Do not deploy, buy services or publish social content unless that action is part of the user's authorized scope.

## Collaboration contract

The specialist files define responsibilities and outputs. They do not automatically run agents or grant tools. When delegation is authorized, assign distinct owned files and avoid overlapping edits. Each handoff includes inputs, output paths, acceptance checks, assumptions and open questions.

## Definition of done

Build and lint pass; relevant behavior is tested; user-visible states handle empty/error cases; documentation matches behavior; no secrets or unrelated files are committed. Use codex/ branches and an understandable PR description. Do not call a prototype production-ready.
