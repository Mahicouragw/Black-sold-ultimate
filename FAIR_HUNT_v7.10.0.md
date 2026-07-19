# v7.10.0 — Fair Hunt & Area Clearing 🏹 (2026-07-19)

## Player-reported bug (fixed)
> "When I type **attack** in the command box, monsters keep appearing — even after I killed them.
> If I finished the area, it should say 'You can attack only in combat.'
> In safe places it should say 'You are not in combat.'"

## Root causes found (bug-hunter report)
1. **Phantom respawns** — `Game.attack()` picked a random monster from the room list with no memory of kills. Monsters reappeared forever.
2. **Mid-combat spawn** — typing `attack` while already fighting started a NEW combat and silently replaced the current enemy.
3. **Roaming ambushes ignored kills** — the movement encounter (game.js) and the sacred ambush (sacred.js) both drew from the full room list forever, and could even fire from a room the player had already left (stale `setTimeout`).
4. **Ambush groups ignored kills** — the "A group of N monsters surrounds you!" queue drew random names from the full room list.

## The Fair Hunt system (new, old features untouched)
- **Every area has a finite monster pack** — regular monsters can each be fought **3 times**, bosses (goblin chief, mega eagle, shadow demon, shadow lord) fall **permanently after one victory**. Quest-required kills are always guaranteed by quota.
- **Kills are remembered per area, forever** (new `slainEnemies` ledger, saved & cloud-synced with the hero). Cleared areas stay peaceful — even after closing and reopening the game.
- **Typed `attack` now answers clearly:**
  - monsters alive here → you hunt one (optionally `attack [name]` to pick your target)
  - area fully cleared → *"You have already defeated every monster in this area. You can attack only in combat — travel onward to find new foes, or brave the Arena of Echoes for an endless fair fight."*
  - safe place → *"There are no monsters here. You are not in combat."*
  - already fighting → strikes the monster in front of you (never spawns a new one)
- **New `foes` command** (aliases: `enemies`, `monsters`, `hunt`) — announces each monster type with remaining count, screen-reader friendly.
- **`look` and room entry** now announce lurking monsters, or a peaceful 🕊️ note when you already cleared the area.
- **Roaming ambushes** only use living monsters and re-verify you are still in that room and not already fighting before striking.
- **Ambush groups** draw only from remaining lives and can never exceed a monster's quota.
- **Arena of Echoes** never consumes an area's pack.

## Verification (jsdom full-game simulation)
**18/18 checks passed**, including: typed attack in combat strikes the same monster (no new spawn), boss killed exactly once, quotas respected, cleared-area message wording, safe-area message wording, no ambush in cleared areas, ledger persistence, look/help regression, zero runtime errors.

## Files changed
- `game.js` — attack rewrite, pack/quota helpers (`getLivingEnemies`, `getEnemyQuota`, `areaClearedInfo`, `showLivingEnemies`), encounter gating, look/foes/help, save-load ledger
- `sacred.js` — ambush & group spawns respect the pack ledger + quota
- `hunt-clear-v19.js` — NEW: kill recording, clearing announcements, save restore
- `index.html`, `service-worker.js` (cache `black-sword-v7.10.0`), `version.js`, `package.json`
