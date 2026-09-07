# Form & Fable — AI Game Studio

A working browser studio for shaping a creature-collecting game. The included **Echobound** world is an editable original sample concept, not a confirmed final game direction.

## Run

Requires Node.js 24 and npm.

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. Build with `npm run build`; check with `npm run lint`. The build output is `dist/` and can be hosted as a static site. No API keys are needed for this version.

## Working features

- Responsive studio overview with counts derived from your actual workspace.
- Create and edit creatures, search by name, filter by element, export creature JSON.
- Editable Game Bible, Story Bible, marketing plan and Markdown downloads.
- Production board with task creation, editable owners and status transitions.
- CSS idle-motion concepts and creature-specific Markdown animation briefs.
- Turn-based encounter prototype with victory, defeat, restart and a persistent collection.
- Browser-local save and JSON workspace export.

## Current boundaries

Data is stored in this browser under `ai-game-studio-v1`, not in GitHub or a server. Clearing browser storage removes that copy. Export backups before moving browsers. The JSON backup is an archival export; an import interface is not implemented in v0.1.

AI generation and autonomous agents are not connected. The agent Markdown files are reusable instructions, not running services. There is no authentication, cloud sync, multiplayer, GPS, walking rewards, payment system, production rigged animation, native iOS/Android build, or public deployment yet. Source changes can be committed to GitHub; in-app document edits require downloading and committing manually.

## Foundation map

| Area                          | Source                                                                             |
| ----------------------------- | ---------------------------------------------------------------------------------- |
| Working browser app           | `src/`                                                                             |
| Shared project instructions   | `AGENTS.md`                                                                        |
| Specialist role instructions  | `agents/`                                                                          |
| Game and narrative rules      | `GAME_BIBLE.md`, `STORY_BIBLE.md`                                                  |
| Creature contract             | `schemas/monster.schema.json`, `content/monsters.json`                             |
| Architecture and delivery     | `docs/ARCHITECTURE.md`, `docs/ROADMAP.md`                                          |
| Gameplay and economics        | `docs/GAMEPLAY.md`, `docs/ECONOMY.md`, `docs/BATTLE.md`                            |
| Walking and anti-cheat design | `docs/WALKING.md`, `docs/ANTI_CHEAT.md`                                            |
| Content production            | `docs/MONSTER_PIPELINE.md`, `docs/STORY_PIPELINE.md`, `docs/ANIMATION_PIPELINE.md` |
| Mobile and website plan       | `docs/MOBILE_PLAN.md`, `docs/WEBSITE_PLAN.md`                                      |
| Audience and release          | `docs/MARKETING.md`, `docs/QA_GATES.md`                                            |

Documentation outside the Working features section describes proposed production behavior. It must not be represented as shipped functionality.
