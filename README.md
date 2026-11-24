# ⚔️ The Black Sword Chronicles - Ultimate Edition

An open-world multiplayer RPG inspired by "The Black Sword" on Amazon Alexa. Features real royalty-free ambient music, enhanced combat, guilds, quests, and more!

## Christmas City and Advent Row

`ADVENT_ROW.md` documents the December 1–25 city, the twenty-five date-locked
doors, their stories, quests, presents and the direction-announcement settings.

## Talking to people (live voice)

Every NPC answers with a live voice: type `say hello`, `ask …`, or any question of
your own, and the person replies in their own pitch, speed and system voice,
reading **exactly the words printed on screen** — the way a chat assistant reads
its answer. Nothing is replaced by a pre-recorded clip, and no "thinking" line is
ever spoken. NPC voices are **on by default** (Settings → *NPC voices read every
reply aloud*), separately from the narration voice, so replies are heard even if
you keep narration off for TalkBack.

**Choosing who answers.** With several people in the room:

| Command | What it does |
| --- | --- |
| `who is here` | Lists everyone present, their role and how to address them. |
| `talk to Greta` | Turns to that person and lets them greet you aloud. |
| `say Greta, where is the forest` | That person answers, in her own voice. |
| `ask Aldric about the shops` | Same, using his name. |

After you name someone, later questions stay with them until you name someone
else. Each person keeps their own conversation. Every character — including each
of the twenty-five door keepers — has their own pitch, speed and preferred
system voice, so no two people share one flat screen-reader voice.

`ai status` reports what the AI service did on the last question: which provider
answered, how long it took, or that it could not be reached. The NPC endpoint
walks a ladder of known-good models, so one retired model can never turn every
reply into the same sentence.

**Always answers.** Greetings, the season, the crier, the game hall, cooking,
your gold, health, quests, exits and the people around you are answered at once
from the game's own knowledge, with no network round trip, so a character never
falls silent. Anything else goes to the live AI service with a 12-second limit;
if it cannot answer, the character still replies aloud from local knowledge
instead of leaving you waiting.

## Synthetic character voices

Every NPC can speak with a **synthetic voice of its own** — the words on screen
read aloud by a neural voice service, not the phone's screen-reader voice. Add a
free key in Vercel and the whole cast changes voice; with no key the device voice
is used with each character's own pitch and speed, so nothing falls silent.
Full steps, free key links and where to paste them: **[VOICE_SETUP.md](VOICE_SETUP.md)**.
Type `voice status` in the game to hear which engine is reading (and whether the
server has a voice key ready), and `voice test` to hear one line in the voice of
the person you are standing with. Spoken lines are cached on the device, so a
sentence heard once costs no quota when it comes round again. To remove quotas
completely, type `voice pack`: a one-time ~90 MB download gives every character
an unlimited on-device voice that works offline with no key (`voice pack status`,
`voice pack off`).

## Built-in narration and gesture interface (7.27.0)

Tap **Start spoken gesture controls** for Accessible Gesture Mode and the optional
spoken tutorial. TalkBack is not the narrator. The default **walk and turn**
scheme behaves like a person walking: swipe up walks forward in the direction you
face, swipe left and right turn you on the spot, swipe down steps backward, a tap
starts or stops continuous walking, a long press walks while held, two fingers
stop instantly and a circle turns you around. Turning never moves you and walking
never turns you; every step follows the room's real exits. Sensitivity, the turn
step (90° or 45°) and the older compass swipes are in Narrator settings.
During a fight the four diagonals become combat gestures: up-right performs your
chosen ability (basic, heavy, quick, Multi-Strike, magical, defensive or your
class special), up-left casts your chosen spell, down-right braces to defend and
down-left heals with a real healing spell first and then a real healing item —
never consuming anything silently. Every ability states its mana cost and its
cooldown, every failure states its reason, and `mastery <spell>` reports attempts,
successes, failures, mastery percent and level from genuinely recorded casts.
Two-finger swipes browse the people, objects and doors that are really in the
room, and a double tap collects, opens or talks to them once — never twice.
Contextual magic, inventory, real routes and narrator settings use the existing
game engine.
See [gesture mappings, setup, validation and remaining Android release gates](GESTURE_ACCESSIBILITY.md).
Physical Android audio acceptance and production deployment are not yet verified.

## 💾 Save safety: quests, reloads and Google sign-in (7.60.0)

Every hero save now carries a `savedAt` timestamp, and palace quest history is
also kept in an append-only device ledger that is written the moment progress
changes and again when the page is hidden. On load the game unions the ledger
back in, and the cloud restore merges cloud and device per hero so the **newer**
snapshot wins. A finished palace quest can no longer be handed out again after a
refresh, a deploy or a Google sign-in. Details and manual verification steps:
[`reports/quest-persistence-fix.md`](reports/quest-persistence-fix.md).

## 🎮 Gesture contexts, real chests and gesture boards (7.61.0)

Seven gesture contexts share one game state: exploration, combat, inventory,
object interaction, chess, snakes & ladders and ludo. Only the active context
reads a swipe, so one gesture can never fire two actions. Inventory mode browses
the real carried items by category, inspects them, equips and unequips through
the real slot system, and drops only after a confirmed second double tap — a
dropped item lies in the room and can be picked up again after a reload. Three
authored chests (Eastern Ruins, Goblin Camp, Witch's Hut) open with their real
locks and hold real items; the Christmas toy chest keeps its own command. Chess,
Snakes & Ladders and Ludo are played by swipe and double tap on top of the
existing engines, so every rule stays enforced by them. Details and the exact
gesture table: [`reports/gesture-modes-v761.md`](reports/gesture-modes-v761.md).

## 🔁 Refresh-safe blessings and palace quests (7.62.0)

Resuming a game after a reload now goes through the same loader as **Continue**,
so the lasting blessing, the daily blessing, the accepted palace quest and every
other saved slice come back with the hero. A still-standing blessing blocks a
second one the same day, a completed palace quest is never offered as accepted
again, and cloud restores union both snapshots instead of letting an older one
erase progress. Settings → Account now names the Google account that is in use.
Details: [`reports/progress-integrity-v762.md`](reports/progress-integrity-v762.md).

## 🔊 Honest spell sounds (7.62.1)

A failed Alohomora no longer plays the recorded door-opening clip, and it never
spends mana on an empty room. Success plays one recorded door click; failure
plays the recorded error cue. Every spell cue is a real recording — no
synthesised tones. Details: [`reports/sound-honesty-v7621.md`](reports/sound-honesty-v7621.md).

## 🌐 Online-only play and the audio audit (7.63.0)

The game now requires an internet connection: going offline opens a spoken
`alertdialog` with one Retry button, pauses every input path and never writes a
save; the connection returning resumes play automatically. Guests still play
online — a Google account is not required. A new `sound test` command names and
plays every recorded effect, and the audit confirms 88 cues, 68 recorded
sound-effect files, 0 missing recordings and 0 synthesised tones. Spoken
narration still uses the device voice engine for dynamic text.
Details: [`reports/online-only-and-audio-audit-v763.md`](reports/online-only-and-audio-audit-v763.md).

## 🎚️ Owner Sound Studio, distinct places, Google vs guest (7.64.0)

The owner can publish their own recorded sound effects and music from
Settings → Sound Studio: only the owner account can publish, every player hears
the result at their next start-up. A Google sign-in plays that account's own
heroes; a guest plays device-only heroes, and the two never mix. All 525
locations that shared a description now describe themselves, so the world has
1164 places and 1164 different descriptions.
Details: [`reports/sound-studio-and-places-v764.md`](reports/sound-studio-and-places-v764.md).

## 🔎 Public Feature Audit

See [`FEATURE_AUDIT.md`](FEATURE_AUDIT.md) and [`PUBLIC_GAMEPLAY_VIDEO_AUDIT.md`](PUBLIC_GAMEPLAY_VIDEO_AUDIT.md) for evidence-based comparisons and lawful source links. No copyrighted gameplay recording is redistributed.

## 🎵 Music and Sound Credits

The game bundles 14 real music tracks and 44 recorded sound effects from verified creator pages on **OpenGameArt**, **Kenney**, and the creator’s itch.io distribution. Assets are individually licensed under CC0, CC BY 3.0/4.0, or CC BY-SA 3.0 as recorded; the project does not treat “royalty-free” as a licence.

See [`AUDIO_CREDITS.md`](AUDIO_CREDITS.md) and [`assets/audio/audio-manifest.json`](assets/audio/audio-manifest.json) for every filename, work, creator, source page, licence requirement, attribution, and verification date.

## 🎮 Features

- 🌍 Finite Open World Exploration (1,145 defined locations across 98 logical regions; no infinite procedural locations)
- 🎵 Context playlists with multiple real tracks, no-repeat smart shuffle, world/battle layers, fades, victory transitions, persisted volume controls, and opt-in queued device TTS
- 🧭 One validated world graph shared by movement and Wayfinder, with diagonal switchbacks, finite boundaries, branch-aware loops, and a six-edge straight-chain maximum
- 👹 122 monster types and bosses
- 🛒 24 location shops using rupees
- 👥 Multiplayer Pass & Play (2-4 players)
- ⚔️ Turn-Based Combat with spells and up to 3 fighting companions
- 💬 Four permanent public chat rooms, owner-only personal rooms, and custom public/private channels
- 🛡️ Room invitations, member limits, owner deletion, blacklists, occupancy counts, and 5/10-minute permanent activation
- 🌐 Recipient-side realtime chat translation into each player's selected language, with original-text disclosure and caching
- 🔊 20 selectable spoken-chat profiles with translated sender-name announcements and French-room pronunciation
- 🌲 A non-wrapping 10×10 Expansive Forest with 100 new named locations, plus connected mainland, Deep Forest and island grids
- 🪦 Twenty-location haunted cemetery with spellcasters, a 1,900-HP Grave Titan and 2,000-HP Death Archbishop
- 🧙 Thirty-two physical Guild Spell Practice Field locations with dice-style practice and mastery growth
- 🧭 Multidirectional 5×8 caves, 5×3 dungeons, and 4×6 tunnels with a north–south-only chasm bridge
- 🏘 Forty numbered public houses plus private owner houses, all with closed doors, foyers, hallways, bedrooms, double bedrooms, bathrooms, kitchens and halls
- 🎯 Context-sensitive action buttons for doors, Temple prayer/healing, Palace, Tavern, shops, fishing and private storage
- 🙏 One permanent Temple attribute choice per hero, plus a two-hour daily battle blessing and variable/failable healing
- ⚔ Transparent original combat with DEX accuracy/dodge/criticals, defense, sharp/blunt penetration, armor, spell resistance and temporary blessings
- 🕳️ Twenty-four tunnel locations with a physical north–south chasm bridge and underground island harbor
- 🏝️ Stormcrown Island with shores, docks, 18 forest locations, fishing, spellcasters, and 600/800/900-HP bosses
- 🎣 Fishing rods, bait, skill progression, river/cave/island catches, rare treasure, and provision-shop stock
- ⚡ Universal Shock spell with blue-flash feedback, stun chance and mastery growth
- 🧾 Natural location/monster prose with internal numbering and scaling terminology removed
- 🏆 Whole-battle summaries: individual defeat names first, then deferred XP, gold, level-ups and drops after the final monster
- 🎲 Three-MP healing rolls of 6/30/40, actual missing-HP clamping, full-health zero result and mastery-based failure reduction
- 🧭 Wayfinder with nearest city/forest/cave routes, exact steps, approximate miles, first direction and compressed instructions
- 🚪 Correct outward routes plus a 20-location Cityward Forest Trail and one-step Exit Forest action
- ⏱ Persistent recovery of 1 HP and 1 MP per real minute, including elapsed closed-game time
- ⛪ Any Temple prayer fully restores HP/MP; no separate Attempt Healing button
- 🔐 Player-facing database/schema errors are redacted, and undiscovered artifacts/legendary rewards require physical searching
- ⚖ Always-on Fair Mode: every 2–6 monster group shares a level-aware per-round damage budget; no Easy/Hard setting
- 🙏 Direct Battle Prayer, Healing Spell and Multi Strike buttons with Temple unlocks and once-per-battle prayer
- 🛡 Multi-target Multi Strike and Light Orbs across all encounter monsters, with per-monster blocks, failure chance and practice growth
- ⚡ Shock deals 80–90 base single-target damage plus mastery growth and blue-flash stun feedback
- 🎒 Inventory Examine/Throw actions and one-hour public-drop expiry
- 🎲 Physical Accessible Game Halls with Ludo, Snakes & Ladders, standards-legal Chess, accessible Carrom and Blackjack
- 🔉 Ordered CC0 dice, numbered step movement, card-draw, shuffle and turn sounds with explicit player/AI announcements, TalkBack logs and automatic background-music ducking
- 👥 Select 1–5 players before Ludo or Snakes & Ladders, with AI opponents or local pass-and-play
- 🎼 Three-way cinematic battle rotation, epic exploration/intro music, scary cemetery music and terrain-specific footsteps
- 🔄 Forced Google cloud-roster restoration even when the browser is already signed in, plus guest-hero merge
- 🔐 Player ID + six-digit PIN continuation
- ☁️ Online features: sign-in with Firebase Authentication, data in a free Supabase database — see [ONLINE_BACKEND.md](ONLINE_BACKEND.md)
- 🔒 Private Player IDs plus globally unique, case-insensitive hero-name reservations with live availability checks
- 🗣 Actual installed Android/Windows/Google system voice names; internal voice codes are hidden from chat
- 🧙 Six-slot Hero Management with create, switch, confirmed deletion, Standard, Hardcore, and Archo permanent-hero modes
- 🏙 A visible City Directory with shortest physical routes to four gates, four streets, houses, Temple, Palace, Guild, Tavern, Park, Marketplace, Shop and Enchantery
- 🙏 Temple, Palace, Guild, markets, gates, streets, shops and houses are physical grid locations with no teleport shortcuts
- 🏠 Purchasable private eight-room houses, seven-day property tax, owner-only storage, and public outdoor drops
- 🌾 Distinct plains, rivers, farms, graveyards, mountain roads and hostile tundra routes
- 🛒 Quantity-based shop lists with item counts and Buy, Examine, and Compare actions
- 🧰 Six equipment slots and four original armor/weapon sets with 2/4/6-piece bonuses
- 🎼 Location-specific CC0 town, inn, forest, temple, palace, exploration, dungeon and varied battle music
- 🙏 Death sends every hero spirit to Auralis’s temple; prayer revives them with a 25% eligible carried-item penalty
- 🤝 Invitation-only brotherhoods and online combat groups with shared realtime damage
- 🧩 Hidden buttons, levers, locked doors, readable documents, and context-sensitive lists
- 🎙 Browser voice commands with English (India/US), Hindi, French, German, and Spanish aliases
- 🏺 Twelve original artifacts with identification, lore journal, two-slot attunement, and passive bonuses
- 🗺️ Personal notes plus secure public/brotherhood community map markers and online-player presence
- 🧾 Filtered inventory/status commands, quantity trading, safe hero restart, and secure feedback
- 🧙 Account hero roster with up to 6 independently saved heroes
- 🧬 6 races and 8 classes with HP, MP, STR, DEX, INT, and WIS builds
- ❤️ Minor Heal for every archetype, Mass Heal for battle groups, and Multi Strike attacks
- 🔨 Equipable sharp/blunt weapons with broad attributes, armor, accessories, food, and potions
- 🙏 Grand Temple of Auralis with favor, hourly prayer, and daily attribute blessings
- 🏰 Royal Palace quests, five-attribute level growth, bonus choices, and companion training
- 🔮 Summoner and Hunter guild spell training after the tutorial
- 🌲 20-monster forest pool, full/reduced encounter settings, and 1–3 enemy groups
- 📦 Manual loot, ground drops, throw/take actions, and persistent item storage (no auto-loot)
- 🔐 Secure Player ID + six-digit PIN progress recovery with hashed PINs and attempt limits
- 🃏 Guild Card Test with two named class spells for every class
- ✨ Universal Minor Heal, Multi Strike, Alohomora, and Emerald Lifestrike
- 🧭 Accessible text navigation showing North, West, East, South, Up, and Down availability
- 🌍 369 connected locations: 25 forest paths, 120 city districts, 40 caves, 15 dungeon sectors, and 10 six-part villages
- 🎲 Occasional cooldown-based encounters: normal groups of 1–6 or reduced groups of 1–3
- 👑 Required Palace advancement ceremony after each hero level, with companion training and a bonus attribute
- 🎵 Real ambient music plus varied recorded sword, impact, monster, door, and spell effects
- 🏰 Guilds, invitations, and combat-group management
- 📜 Quest System with Main Story
- 🎒 Full Inventory Management
- 💰 Trading & Economy
- 🗺️ World Map & Mini-Map
- ♿ Fully Accessible (Screen Reader)

## 🕹️ Commands

| Command | Action |
|---------|--------|
| `north/n`, `south/s`, `east/e`, `west/w` | Move |
| `look` | Examine surroundings |
| `take [item]` | Pick up item |
| `attack` | Fight enemies |
| `cast [spell]` | Use magic |
| `use [item]` | Use item |
| `inventory` or `i` | View inventory |
| `stats` | View character |
| `map` | View world map |
| `quests` | View active quests |
| `social`, `friends`, `companions` | Open social and companion panel |
| `request/accept/reject [name]` | Manage friend requests |
| `message [name] [text]` | Send a local simulated chat message |
| `invite [name]`, `heal [name]` | Recruit or heal a companion/friend |
| `guild`, `group` | Open guild and joint combat group |
| `shop` | Browse a shop at the current location |
| `travel [location]` | Use dimensional travel (10 rupees) |
| `world` | Print world, monster, and shop totals |
| `temple`, `pray magic` | Visit Auralis and request a daily Magic Point blessing |
| `enchantment shop` | Visit Selvara's Five-Runes Enchantery |
| `enchant [item] [attribute]` | Permanently enchant carried equipment |
| `loot`, `take loot [item]`, `take all loot` | Inspect and manually collect ground loot |
| `card test`, `answer [word]`, `guild spells` | Earn two class-specific Guild spells |
| `cast alohomora` | Open or release locks outside combat |
| `give/take [item] to/from [companion]` | Transfer companion equipment |
| `watch/view/examine [target]` | Inspect monsters, companions, or items |
| `mission`, `hero management`, `revive hero` | Quests, hero roster, and revival |
| `chat rooms`, `join room [name]` | Open or switch secure chat rooms |
| Room panel | Create public/private rooms, set 2–200 users and 5/10-minute activation |
| Room owner controls | Invite by hero name, blacklist, or delete a custom channel |
| `identify/attune/unattune [artifact]` | Manage discovered artifacts |
| `artifact journal` | Read identified artifact lore and active attunements |
| `publish map Title \| note` | Publish a community map marker at the current location |
| `community map` | Read shared markers at the current location |
| Voice button | Speak one command using the selected language |
| `fish`, `fishing status` | Fish at marked rivers, shores, docks, and underground water |
| `examine [monster]` | Hear HP, attributes, damage, defense, and spell list |
| `cast multi strike` | Attack every current encounter target; each monster may block |
| `cast light orbs` | Spend 3 MP per living monster for multi-target light damage |
| `attack [monster name]` | Target a current or waiting monster by name |
| `fairness status` | Explain current group damage scaling; no Easy/Hard modes |
| `wayfinder`, `distance`, `how far` | Show miles, steps, next direction and route to city/forest/cave entrances |
| `exit forest`, `next exit step` | Walk one Wayfinder-calculated step toward the nearest city |
| `battle prayer` | Use the once-per-battle Temple-unlocked prayer |
| `take everything` | Collect all available public ground loot |
| `cast shock` | Stronger 80–90+ single-target blue-light damage |
| `examine spell [name]` | Show MP cost, power, growth, efficiency, damage, and healing history |
| `spellbook`, `spell efficiency` | Review efficiency for every known spell |
| `examine black sword locations` | List only discovered Black Sword locations; undiscovered names remain secret |
| `open door`, `close door` | Operate public or owner-only private-house doors |
| Temple location actions | Choose one permanent attribute, receive a daily temporary blessing, or attempt healing |
| `daily blessing`, `temple heal` | Use later Temple services after the permanent blessing |
| `where is temple` | Hear physical step-by-step Temple directions |
| `examine combat` | Explain accuracy, defense, critical and penetration mechanics |
| `help` | Show all commands |

## 📱 PWA and Mobile Apps

Version **7.21.0** includes an installable PWA, project-relative GitHub Pages paths, offline audio/graph assets, service workers, Android/iOS Capacitor projects, and security/asset/world validation scripts. See [`MOBILE_BUILD.md`](MOBILE_BUILD.md).

```bash
npm install
npm test
npm run validate
npm run pwa:check
npm run security
npm run cap:sync
```

## 🚀 Quick Deploy

[![Deploy to Vercel](https://vercel.com/button)](https://vercel.com/import/project?template=https://github.com/Mahicouragw/Black-sold-ultimate)

Or:

```bash
git clone https://github.com/Mahicouragw/Black-sold-ultimate.git
cd black-sword-ultimate
vercel
```

## 📁 Project Structure

```
black-sword-ultimate/
├── index.html          # Main game
├── styles.css         # Styling
├── game.js           # Core engine
├── music.js          # Music & SFX system
├── world.js          # World/locations data
├── combat.js         # Combat mechanics
├── quests.js         # Quest system
├── multiplayer.js    # Multiplayer logic
└── README.md
```

## 🌎 World Map

```
                    [Northern Mountains]
                     /      |      \
           [Ice Cave]  [Ancient Shrine]  [Eagle Peak]
                          |
[West Forest]-------[Kaliwasch City]-------[Eastern Ruins]
                          |
                    [Southern Swamp]
                     /         \
            [Goblin Camp]   [Witch's Hut]
                          |
                    [Dungeon Entrance]
                          |
                      [The Depths]
                     /           \
              [Dark Hall]    [Shadow Chamber]
                          |
                    [THE BLACK SWORD]
```

## 🎵 Music Tracks

- **Kaliwasch City** - Peaceful town music
- **Wilderness** - Forest/mountain ambient
- **Combat** - Epic battle music
- **Dungeon** - Dark, mysterious tones
- **Victory** - Triumphant fanfare
- **Boss Fight** - Intense boss theme

## 🙏 Credits

Inspired by **"The Black Sword"** by Narkuma on Amazon Alexa.

Original Alexa Skill: https://www.amazon.com/Narkuma-the-black-sword/dp/B07B973X4M

Music and sound: see [`AUDIO_CREDITS.md`](AUDIO_CREDITS.md) for the required per-file CC BY / CC BY-SA attributions and CC0 courtesy credits.

## 📄 License

MIT License

## v7.17.3 Android refresh

The Android workflow now validates the PWA and security checks before building, uses the current source version, and publishes a consistently named `BlackSwordUltimate.apk` release asset.
