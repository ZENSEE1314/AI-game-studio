# Architecture

## Implemented v0.1

A React + TypeScript browser application built with Vite. React state is initialized from validated local storage; subsequent changes are persisted under `ai-game-studio-v1`. Markdown and JSON downloads use browser Blob URLs. SVG creature concepts and CSS motion have no external media dependency. No server handles requests.

```text
Browser UI -> React workspace state -> localStorage
                        |
                        +-> Markdown / JSON file export
```

## Proposed production architecture

Keep the studio web UI distinct from the player mobile client. A server API authenticates users, authorizes project membership, versions game content, queues AI draft jobs and executes authoritative encounters. PostgreSQL stores projects, memberships, content revisions, quests, encounters and an append-only inventory ledger. Object storage holds art, animation and source files. A worker handles generation and asset conversion.

```text
Studio web ----\
               API -> PostgreSQL + object storage
Mobile game --/  |
                +-> generation queue -> worker -> review queue
```

## Contracts

Project membership is checked on every project request. All writes require a version/ETag to prevent silent overwrites. A generation job includes project ID, role, input revision, schema version, budget limit and request ID. Outputs remain drafts until reviewed. Idempotency keys prevent duplicate inventory rewards and duplicate job submissions.

## Security and operations

Provider secrets remain on the server. Authenticate callbacks, restrict object access by project, rate-limit generation, cap payload sizes and validate output schemas. Logs contain request IDs and error categories, not credentials or precise location. Separate development and production data. Backups must be periodically restored in a test environment.

## Migration

Add a versioned workspace import before replacing local state. Authenticate, validate, preview conflicts, then submit a single atomic migration. Keep the user's export intact on failure. Production save data requires explicit schema migrations.

## Open decisions

Hosting, AI provider, budget, native engine, audience age range, regions and monetization need creator decisions before production commitments. The current repository supplies a working studio prototype and these plans, not the production services.
