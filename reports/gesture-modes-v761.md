# Gesture contexts, real objects and gesture boards — 7.61.0

Release: **7.61.0** (branch `arena/93423310-black-sold-ultimate`, based on 7.60.0).
Everything below was inspected in this repository and tested with the real game
code; no feature is listed as working unless a test proves it.

## What was inspected first

| Area | Finding |
| --- | --- |
| `gesture-accessibility.js` (1372 lines) | The live gesture stack: `UI.handle(token)`, walk/turn scheme, combat tokens, object focus (`nearbyObjects`, `browseFocus`, `activateFocus`), inventory menu, `speak()` through `AudioManager.playVoice`. It handled **one** list of tokens and had no mode separation. |
| `game-hall-v755.js` (851 lines) | Live Chess and Snakes & Ladders. `window.HallPlay` = `Play` with `square(sq)`, `chessMove(from,to)`, `roll()`, `describe()`, `myTurn()`, `myColor()`, `shown.fen`, `shown.pos`, `selected`, `targets`, and the game's own spoken replies. |
| `game-hall.js` (361 lines) | The only Ludo engine: `state.tokens`, `state.roll`, `legalLudoTokens(seat,die)`, `roll()`, `moveLudo(index)`, safe squares `[0,8,13,21,26,34,39,47]`, 56-step home path, extra turn on a six or a capture. |
| `items-hunger-v30.js`, `game.js` | Real equipment: slots `rightHand, leftHand, head, face, ears, neck, chest, back, waist, legs, fingers`, `Game.equipItem`, `Game.unequipItem`, `game.state.player.gearSlots`. |
| World objects | **No generic chest system existed.** `ruins` lists the feature "hidden chest"; `advent-calendar-v730.js` has one real Christmas toy chest (`christmas open chest`, saved as `player.advent.toyChest`). Rune doors are real (`specialDoor`, `state.specialDoors`, Alohomora / Multiple Strike). House doors are ownership locks, not key locks. |

## Implemented

### 1. One gesture, one context — `gesture-modes-v761.js`

`GestureAccessibility.UI.handle` is wrapped once. Only the active context reads a
gesture; when it consumes the token the base handler is not called, so a swipe
can never produce two actions.

| Context | Entered when | Leaves when |
| --- | --- | --- |
| Exploration | default / walk scheme | combat starts, inventory opens, object browsed, board opens |
| Combat | `state.inCombat` is true (real fight state, polled every 700 ms) | the fight ends |
| Inventory | inventory mode opened | two-finger tap, two-finger swipe down, or Back |
| Object | two-finger left/right chooses something nearby | two-finger swipe down |
| Chess / Snakes & Ladders | a live `HallPlay.match` is on the table and the hall panel is visible | the game ends or the panel closes |
| Ludo | `GameHall.type === 'ludo'` with real tokens | the game ends or the panel closes |

### 2. Gesture table per mode

**Exploration** (unchanged from 7.60.0): swipe up forward, down backward,
left/right turn, circle turn around, tap toggle walking, long press walk,
two-finger tap stop, two-finger left/right browse nearby objects.

**Combat** (unchanged, still one context): up-right attack ability (basic,
heavy, quick, Multi-Strike or special per the saved setting), up-left chosen
spell, down-right defend/dodge, down-left healing. Attempts, successes,
failures and mastery are recorded by the existing systems; a 90 % mastery is
never spoken as guaranteed.

**Object Interaction**: two-finger left/right previous/next object, double tap
interacts, two-finger swipe down cancels. Announcements come from real data:
name, what it is, whether it can be collected/used, locked or open, and why.
Chests add their real lock state and contents; rune doors add their real
requirement.

**Inventory**: two-finger left/right changes category (Weapons, Armour,
Healing, Magic, Keys, Quest, Materials, Miscellaneous — only non-empty
categories are offered), up/down changes item, double tap inspects, long press
opens actions, two-finger swipe down goes back, two-finger tap closes.

Item speech is read from the carried stack: name, category, quantity,
description, damage/defense/stat bonuses, value, slot, equipped or not,
equippable, usable, droppable, combinable when the item really has a combination
field, and any `requires`/`level` restriction. Quest and unique items are
protected from dropping and say so.

**Equipment**: equipping first announces the item being replaced on that slot,
then calls the real `Game.equipItem`, then reads back the real `gearSlots`,
`weapon`, `weaponDamage` and `defense`. If state did not change, the result is
reported as a failure with the game's own reason. Unequip works the same way.

**Drop**: long press → Drop → confirmation menu → only a confirmed second
double tap removes exactly one item. The item is stored in the hero save at the
current room, announced with that room's name, and becomes a real ground object
that Object mode can pick up again. Public-loot (`dropPublicItem`) is left
untouched for online play.

**Chess**: swipes and diagonal swipes move the focus square, double tap selects
or confirms, two-finger tap cancels a selection, circle (or down) reads the
whole board, two-finger left/right cycles the player's own pieces. Square,
piece, selection and legal targets are read from the live `HallPlay` state and
from the FEN of the vendored `chess.js`; the move itself is sent to
`HallPlay.square`, so check, checkmate, castling, promotion, en passant and
stalemate stay enforced inside the engine. The engine's own voice announces the
result of a selected move, check and checkmate.

**Snakes & Ladders**: double tap rolls exactly once through `HallPlay.roll()`;
left/right browse players and read their real squares and whose turn it is;
up reads your own square and turn; down/circle reads the whole board; two-finger
tap repeats the board review. Ladders, snakes, overshoot and the final square are
announced by the existing engine using squares 1–100.

**Ludo**: double tap rolls when the die is not up; when the die is up, the
first double tap selects the focused legal token and the second double tap
confirms the move; left/right browse the seat's tokens with yard / square / home
and whether the die can move them; up/tap reads the focused token; down/circle
reads every seat, the die, and a winner; two-finger tap clears the selection before it is confirmed.
`legalLudoTokens` and `moveLudo` do all rule work (six to leave the yard,
`pos + die <= 56`, safe squares, captures, extra turn, win).

**Narration**: every sentence goes through the existing `speak()` /
`AudioManager.playVoice` queue on its own channel, so it works with TalkBack
off. No new queue was added, so messages cannot overlap twice.

### 3. Chests, doors and ground loot — `world-objects-v761.js`

Three chests were added to rooms that already describe them, holding only real
catalogue items:

| Room | Object | Lock | Contents |
| --- | --- | --- | --- |
| Eastern Ruins | Ancient Chest | needs the **Skeleton Key** (not consumed) | Chainmail, Blessed Amulet, 2 × Sky Feather |
| Goblin Camp | Treasure Pile | unlocked | 2 × Stolen Gold, 2 × Iron Ore |
| Witch's Hut | Supply Chest | unlocked | Healing Potion, Mana Potion, Fairy Dust |

Opening is a real state change (`state.worldChests[id].opened`); failure leaves
the chest closed and says why. Collecting calls the real
`Game.addItemToInventory`, checks that the bag quantity actually rose before
announcing success, decrements that chest slot, and refuses a second pickup from
an empty slot. Chest state, what is left in each chest, and dropped ground loot
are written into `Game.getSaveData()` / restored by `continueGame()`, so they
survive a reload, a cloud merge and the per-hero `savedAt` rules from 7.60.0.

The Christmas toy chest at `starlight_toy_vault` is surfaced as an object and
still runs its own `christmas open chest` command.

Doors surfaced as objects: rune doors (described with their real state and the
real Alohomora / Multiple Strike requirement), and the Christmas vault chest.
House doors remain the ownership locks they already were. **There is no
key-locked door in this world** — keys only exist for chests (Skeleton Key) and
the Christmas mechanisms — so no invented door lock was added.

### 4. Tests

| Suite | Tests | Result |
| --- | --- | --- |
| `tests/gesture-modes-v761.test.mjs` | 11 | pass |
| `tests/gesture-board-games-v761.test.mjs` | 11 | pass |
| `tests/world-objects-v761.test.mjs` | 8 | pass |
| Full suite (`node --test tests/*.test.mjs`) | **660** | **659 pass, 0 fail, 1 skipped** |

The board tests back the fake hall with the real vendored `chess.js`, so an
"illegal" move in the tests is illegal by the same engine that runs the game.
The gesture tests stub only the engines' public surface (`HallPlay`,
`GameHall`) and assert that one gesture produces one engine call.
`npm run validate`, `npm run build` and `npm run pwa:check` all pass at 7.61.0.

### 5. Honest gaps

* **Audio**: there are still no sound recordings for a chest opening, a door
  rattle, a locked door, a failed door attempt, a shield brace, heavy miss or a
  mastery sting. Board sounds that do exist are used by the engines:
  `board-dice`, `board-piece`, `board-turn`, `board-error`, `ladder-up`,
  `snake-down`, `game-win`, `game-lose`, `card-shuffle`, `card-draw`. Nothing
  was synthesised or faked to fill the gaps.
* **Chess check announcement**: check and checkmate are spoken by the game hall
  itself when the move lands. There is no separate gesture that asks "am I in
  check?" without moving; the board review lists pieces and side to move.
* **Ludo online**: Ludo is the local `GameHall` game (vs computer or hot-seat).
  Chess and Snakes & Ladders keep their server matches.
* **Chests**: only the three authored chests plus the Christmas toy chest. Other
  rooms have no chest because the world never defined one there.
* **Distance**: objects are announced as "here in <room>". The game has no
  per-object distance or step count, so none is invented.
* Real Android touch/audio testing was not possible in this sandbox; the tests
  drive the same tokens the touch recogniser emits.
