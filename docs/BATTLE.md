# Battle Contract

## Current prototype

Player starts with 100 energy; target starts at its configured HP. Resonate deals 22. If target HP becomes zero, victory resolves immediately and no counterattack occurs. Otherwise subtract target attack from player energy. Clamp both values at zero. Zero player energy ends the encounter as defeat. Inputs are disabled outside an active encounter. Restart resets turn, target HP and player energy. Collection uses unique species IDs.

## Examples

Mossling: victory on turn 5, player energy 28. Emberfox: victory on turn 4, energy 28. Ripplefin: victory on turn 5, energy 40. A custom 200-HP, 50-attack creature defeats the player on turn 2.

## Production contract, not implemented

Server issues encounter ID and content revision. Actions carry unique request ID and expected turn. Server validates ownership, active state and turn, applies deterministic resolution transactionally, and records a unique reward ledger entry. Retried actions return the recorded outcome. Replays cannot grant extra inventory. The client only renders outcomes.
