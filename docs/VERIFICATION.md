# Verification — v0.1

Checks performed on the initial implementation:

- `npm run build`: TypeScript compilation and Vite production build pass.
- `npm test`: five automated tests pass: creature schema/ID validation, all starter balance outcomes, defeat/restart, final-hit counterattack suppression, and duplicate collection prevention.
- Browser: created Fernkin, reloaded, and confirmed the creature remained available.
- Browser: completed the Mossling encounter in five turns; target HP reached zero, player energy remained 28, the action disabled and Mossling appeared in the collection.
- Browser: created a task, changed its owner to QA and moved it to Done; the board updated correctly.
- Visual: inspected the responsive overview in the narrow in-app browser.

No native device, production backend, GPS, external AI provider, payment, or public deployment test has been performed. Those systems are not implemented. Export/import round-trip is not tested because an import interface is not included.
