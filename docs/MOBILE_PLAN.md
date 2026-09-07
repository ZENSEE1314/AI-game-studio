# iOS and Android Plan

Status: design plan only. This repository currently runs a responsive browser studio, not a signed native game.

## Phases

1. Validate combat and narrative with browser playtests.
2. Choose the player-client engine after profiling one representative animated scene. A 2D web-based shell and a native 3D engine have different asset, rendering and maintenance costs; do not commit before the visual direction is approved.
3. Build a shared data contract for creatures, quests and encounters. Keep the studio as a web content tool.
4. Deliver one offline-capable exploration scene with local saves, permissions-denied behavior, large text and reduced motion.
5. Add authenticated backend inventory and migrations. Resolve offline actions on the server before granting persistent rewards.
6. Test builds on real iOS and Android devices, then prepare store metadata, privacy declarations, crash diagnostics and release signing.

## Platform gates

iOS signing needs an appropriate Apple developer account and build environment. Android release signing requires a securely stored key and recovery plan. Do not put either signing credentials or provider keys in this repo. Verify current store requirements directly with Apple/Google before submission.

## Device matrix

Small/large screens; lower-memory device; current and oldest supported OS; denied/revoked permissions; offline/slow network; background/resume; reduced motion; screen reader. The supported OS floor remains a product decision.
