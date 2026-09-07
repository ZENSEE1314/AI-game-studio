# Echobound — Game Bible

Status: original sample concept, editable and awaiting the creator's final direction.

## Promise

A world of little wonders, waiting just outside. Play a Listener who discovers small spirits called Echoes and helps their habitats remember forgotten songs.

## Pillars

1. Curiosity: discoveries reward observation rather than relentless grinding.
2. Companionship: every Echo has a distinctive habit and emotional hook.
3. Short sessions: a useful experience should fit a few minutes.
4. Access: stationary play offers meaningful progression alongside future walking features.

## Core loop

Discover a habitat → encounter an Echo → earn trust → add a companion → unlock a narrative beat → return to explore another habitat.

## First playable, implemented

Browser encounter arena, three seed creatures, player energy 100, action damage 22, creature counterattack, victory/defeat and local collection. No inventory currency or terrain simulation is implemented.

## Future vertical slice

One grove, three complete creature rigs, a five-minute introductory quest, one progression track, device-local save migration, and an optional accessibility mode. Validate this before adding more biomes or multiplayer.

## Creature roster

| ID        | Element | Health | Attack | Personality                |
| --------- | ------- | -----: | -----: | -------------------------- |
| mossling  | Nature  |     90 |     18 | Shy garden keeper          |
| emberfox  | Fire    |     75 |     24 | Warm-hearted guide         |
| ripplefin | Water   |    110 |     15 | Patient collector of songs |

## Design exclusions for initial release

No real-money trading, no paid randomized rewards, no mandatory night exploration, no location-based competitive rankings, no dependence on background GPS. Proposed features must pass a feasibility and accessibility review.

## Change process

Record a proposed rule, reason, affected systems, acceptance metric, and migration needs. Update schemas and tests before changing saved-data semantics. The studio's editable browser copy is separate from this repository document.
