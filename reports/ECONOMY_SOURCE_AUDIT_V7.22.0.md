# v7.22.0 Source-Level Economy Audit

Audit date: 2026-08-16

Scope: every runtime path found by recursive source search that mutates player gold, XP, rubies, gold rubies, diamonds, inventory, or ground loot.

## Root cause

`companion-economy-arena-v18.js` wrapped `Game.enemyDefeated` after the whole-battle summary implementation. Its old `battleLoot()` executed after **every defeated monster**, not once per battle. An enemy with XP >= 60 was treated as elite and independently received a 25% Ruby roll, a 12% gold-Ruby roll when strong, and a 25% Diamond roll. These rolls were in addition to the Ruby base/pity roll and were not protected by a battle transaction ID. This made premium currency appear to be caused by an attack that killed a monster and made Diamonds common.

The old attack override in `black-sword-alexa-multiplayer-v26.js` also checked nonexistent `state.combat` instead of `state.inCombat`, so plain Attack could create a new enemy. That state bug made reward symptoms easier to reproduce.

## Authoritative battle reward path

`battle-summary-cleantext-v12.js::Game.enemyDefeated` now only accumulates defeated-enemy XP, gold, item drops, and enemy tier records. On final victory it calls exactly one `RewardEconomy.settleBattle()` transaction. `companion-economy-arena-v18.js` owns the only battle wallet mutation. Transaction IDs are stored in `state.economy.settledTransactions`; replaying an ID returns the stored result without changing any balance.

Central probabilities are `RewardEconomy.config.tiers`:

| Tier | Ruby | Gold Ruby | Diamond |
|---|---:|---:|---:|
| Common | 2% | 0% | 0% |
| Elite | 8% | 2% | 0.2% |
| Boss | 28% | 8% | 1.5% |
| Major boss | 55% | 20% | 8% |

Ruby has a 25-victory dry-run guard. Diamond has no ordinary-enemy path. Arena Diamond is a controlled wave-25 milestone. A normal attack has no call to `grant`, `settleBattle`, or any premium wallet field.

## Mutation inventory

| File | Function / trigger | Currency or item | Old behavior | New behavior / owner |
|---|---|---|---|---|
| `companion-economy-arena-v18.js` | old `enemyDefeated` wrapper / `battleLoot` | Ruby, gold Ruby, Diamond | Multiple premium rolls per defeated monster; Diamond up to 25% for XP >= 60 | Wrapper and `battleLoot` removed. `RewardEconomy.settleBattle` runs once per final victory with an idempotent battle ID |
| `companion-economy-arena-v18.js` | `RewardEconomy.settleBattle` | Gold, XP, Ruby, gold Ruby, Diamond | Did not exist | Sole battle wallet mutation; centralized tier configuration and one transaction result |
| `battle-summary-cleantext-v12.js` | `Game.enemyDefeated` | Gold, XP, items | Mutated XP/gold per enemy and invoked multiple reward/timeline handlers | Accumulates only; final enemy settles once, announces once, saves once |
| `battle-summary-cleantext-v12.js` | item roll / final ground publication | Items | Item roll per defeated enemy, published at final summary | Still builds useful common loot, but publishes as part of the one battle transaction; no premium currency |
| `companion-economy-arena-v18.js` | `claimDailyTreasure` | Gold, Ruby, gold Ruby | Daily gold; weekly Ruby/gold Ruby | Preserved as a distinct daily event, not an attack or battle-turn reward |
| `companion-economy-arena-v18.js` | `reviveCompanion` | Gold, Ruby, gold Ruby, Diamond | Spends selected currency | Preserved sink; validated balance and out-of-combat state |
| `companion-economy-arena-v18.js` | Arena settlement in `RewardEconomy` | Gold, Ruby, gold Ruby, Diamond | Separate post-defeat grants; Diamonds at waves 7 and 10 | Included in same battle transaction; Ruby wave 5, gold Ruby wave 10, Diamond wave 25 |
| `companion-economy-arena-v18.js` | Arena defeat rescue | Ruby | Guaranteed Ruby on defeat | Removed; defeat never awards premium currency |
| `game.js` | `completeQuest` | Gold, XP, optional item | Quest completion reward | Preserved as an explicitly separate quest event |
| `hunt-achievements-v20.js` | `unlock` | Gold | 150 gold on a newly unlocked badge | Preserved as a distinct one-time achievement event; never Ruby/Diamond and guarded by achievement ID |
| `alexa-parity.js` | `buyQuantity` | Gold decreases, inventory increases | Validated shop purchase | Preserved economic exchange |
| `alexa-parity.js` | `sellQuantity` | Gold increases, inventory decreases | Validated shop sale | Preserved economic exchange |
| `sacred.js` | `sellItem` | Gold increases, inventory decreases | Validated sale | Preserved economic exchange |
| `game.js` | shop purchase/sale methods | Gold and inventory | Location/price-validated trades | Preserved; not combat rewards |
| `city-directory-v9.js` | `restAtTavern` | Gold decreases | Ten-gold healing service | Preserved sink |
| `sacred.js` | `enchantItem` | Gold decreases | Rune purchase | Preserved sink |
| `housing-world-v5.js` | house purchase/tax | Gold decreases | Ownership and tax payments | Preserved sinks |
| `horse-racing-v22.js` | race entry/reward | Gold/diamond spend, gold reward | Skill/race economy | Preserved special activity; no attack integration |
| `alexa-parity.js` | `useLever` | Gold increases | One-time 75-gold puzzle cache guarded by puzzle state | Preserved one-time world treasure |
| `game.js`, `housing-world-v5.js`, `sacred.js`, `wayfinder-battle-actions-v15.js` | pickup/take/drop/store/retrieve/give | Items | Moves item units between world, inventory, storage, companion, and public drops | Preserved; no premium wallet mutation |
| `island-tunnel-fishing.js` | `fish` | Items | Bait/cooldown-validated catch | Preserved separate activity |
| `resource-recovery-forest-exit-v17.js` | `performTempleRescue` | Items decrease | Fair defeat loss of eligible units | Preserved resource sink |
| `game.js` | `levelUp` | XP decreases by threshold | Consumes accumulated XP toward next level | Preserved progression accounting |
| spell modules | mastery entries | Spell XP only | Spell practice/efficiency XP | Not player level XP or currency; preserved in spell mastery save state |

## Trigger and duplicate analysis

- Plain Attack: damage/state only; no reward call.
- Each monster defeat: one summary accumulation and one quest/area-ledger update.
- Final group defeat: one `settleBattle(summary.id)` call.
- Duplicate final event: same ID returns `duplicate: true`; balances do not change.
- Quest and achievement payouts remain separately identified one-time events rather than hidden battle-currency mutations.
- Ruby and Diamond mutations now appear only in the centralized economy module; horse racing and revival only **spend** Diamond.
