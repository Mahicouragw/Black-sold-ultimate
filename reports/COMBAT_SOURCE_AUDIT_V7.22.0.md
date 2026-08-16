# v7.22.0 Source-Level Combat Audit

Audit date: 2026-08-16

## Authoritative transition map

| Transition | Authoritative owner | Result |
|---|---|---|
| User command | final command adapter in `stabilization-v7211.js` | Routes state-valid Attack, target Attack, Defend, Flee, Heal, Multiple Strike, Opening Doors, feedback and moderator commands |
| Random encounter eligibility | `sacred.js::randomEncounterEligibility` | Uses unsafe region pool, movement threshold, 45/90-second cooldown and probability |
| Random encounter timer | `sacred.js::Game.enterLocation` | One nonce-protected scheduler; old v26 duplicate scheduler removed |
| Enemy/group selection | `sacred.js::Game.startCombat` | Two-to-six ordinary enemies, boss isolation, endless roaming pool independent from quest ledger |
| Battle creation | existing `Game.startCombat` chain, finalized by `stabilization-v7211.js` | Sets `state.inCombat` and enemy/group state while remaining on the same world screen |
| Battle presentation | `Game.beginCommandCombat` | Closes only blocking panels, shows compact inline status, disables movement, focuses command input after encounter TTS |
| Encounter aggregation | `MonsterGroupFormatter` | One sentence feeds log, inline sighted status, accessible label and game TTS |
| Player attack | `world-grid-houses-combat-v8.js::Game.playerAttack` | Internal accuracy/defense/critical calculations; natural player-facing result only |
| Named target attack | `fair-group-combat-v14.js::Game.attackNamedTarget` | Targets a real living encounter member; cannot spawn an enemy |
| Enemy turn | `fair-group-combat-v14.js::enemyGroupTurn` plus existing enemy AI | Shared fairness budget, spells/specials, defense, resource pressure and natural result events |
| Defend | existing `Game.defend` | Consumes a turn and halves the next successful incoming hit |
| Flee | existing `Game.tryFlee` | Boss-aware success chance; success restores world UI/music, failure takes an enemy turn |
| Healing | `GameSpellSystem.castHealing` | Known-spell, full-health, mana and cooldown validation; fair failure; save/SFX/TTS |
| Multiple Strike | `GameSpellSystem.castMultipleStrike` | Combat/target/mana/cooldown validation, controlled failure, up to three targets, save/SFX/TTS |
| Opening Doors | `GameSpellSystem.castOpeningDoors` | Only explicit magical `specialDoor`; no mana consumed on wrong/already-open target |
| Destructible special door | `GameSpellSystem.breakSpecialDoor` | Requires `canBeBrokenByMultipleStrike=true`; normal doors reject it |
| Damage | existing HP/brace/group target state | Internal calculations preserved; technical percentages/formulas removed from ordinary narration |
| Monster defeat | `battle-summary-cleantext-v12.js::Game.enemyDefeated` | Guarded by `_defeatProcessed`; accumulates one enemy into the current battle summary |
| Quest kill ledger | `hunt-clear-v19.js::recordDefeatedForArea` | Called once from authoritative defeat; does not wrap combat or award currency |
| Final victory | `battle-summary-cleantext-v12.js` | One idempotent economy transaction, one aggregated victory event, one reward event |
| Loot | battle summary + existing ground/public loot commands | Ground loot announced; no automatic giant result/loot button panel |
| Battle music | existing `AudioManager` | World → smart-shuffled battle → victory → restored world context; no second audio engine |
| Game TTS | `Game.emitGameEvent` → `AudioManager.playVoice` | One centralized queue; event-ID dedupe; critical encounter interruption |
| UI reset | `Game.finishCommandCombat` | Hides inline status, restores real direction controls and focuses command input |
| Save/cloud sync | existing `Game.save` and `OnlineSystem.saveGame` | Existing save keys and roster/cloud architecture preserved |

## Root causes corrected

1. `black-sword-alexa-multiplayer-v26.js` used nonexistent `state.combat`; Attack outside combat could create a monster. It now checks the real `state.inCombat` and rejects Attack outside combat.
2. The same v26 module installed a second random encounter timer outside `sacred.js`, bypassing cooldown and sometimes firing after another battle. The duplicate scheduler was removed.
3. Core battle creation opened `#combat-panel`. It now sets logical combat state only; the retained legacy nodes are native-hidden/inert compatibility storage and are never opened.
4. Keyboard combat shortcuts fired while the command input had focus, so typing “attack” could trigger an extra action on the first letter. Input/textarea/select/contenteditable targets are now excluded.
5. Ordinary attack narration exposed accuracy, defense and penetration formulas. Calculations remain internal; narration now reports miss, block, hit or critical damage naturally.
6. Professional combat maintained a second narration queue/live region. It now delegates every spoken event to `Game.emitGameEvent` and the existing `AudioManager` queue.
7. Battle reward and premium-currency hooks ran at different wrapper layers. Final victory now has one transaction owner and one ID.
8. Post-battle code automatically populated large loot-action buttons. Final settlement now reports command syntax; optional loot controls appear only when the player explicitly opens loot.

## Difficulty audit

- Early levels receive a modest non-boss attack/defense reduction, bounded by existing group fairness.
- Mid levels use normal scaled stats and broader enemy abilities.
- Late levels receive modest attack/defense pressure; difficulty also comes from group composition, spells, brace/roar behavior, equipment, mana, cooldowns and resource costs.
- Boss data and special abilities remain intact; the change does not solve difficulty by blindly inflating HP.
- Healing and Multiple Strike now consume mana, have cooldowns, validate targets/state and can fairly fail only after a valid cast.

## Screen and accessibility audit

- `game-screen` remains active throughout combat.
- City Directory and other blocking panels close when an encounter begins; world location and navigation state are unchanged.
- Command input is re-enabled/focused after the one encounter TTS request completes.
- Direction commands are rejected during combat and controls remain disabled until victory/flee/rescue.
- Both Sighted and Blind/TalkBack-first modes share this exact state machine.
- Physical Lenovo/TalkBack behavior still requires real-device verification; source/DOM/TTS tests do not prove device audio focus or touch exploration.
