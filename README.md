# ⚔️ The Black Sword Chronicles - Ultimate Edition

An open-world multiplayer RPG inspired by "The Black Sword" on Amazon Alexa. Features real royalty-free ambient music, enhanced combat, guilds, quests, and more!

## 🔎 Public Feature Audit

See [`FEATURE_AUDIT.md`](FEATURE_AUDIT.md) for the evidence-based comparison against the documented Amazon Alexa mechanics and commands.

## 🎵 Music and Sound Credits

The game now bundles real cinematic music and recorded RPG sound effects from **OpenGameArt**, all released under **CC0 / public domain**. It no longer generates procedural oscillator music.

See [`AUDIO_CREDITS.md`](AUDIO_CREDITS.md) for every track, creator, source page, and license.

## 🎮 Features

- 🌍 Open World Exploration (109 locations across the original realm + 12 expanded regions)
- 👹 122 monster types and bosses
- 🛒 24 location shops using rupees
- 👥 Multiplayer Pass & Play (2-4 players)
- ⚔️ Turn-Based Combat with spells and up to 3 fighting companions
- 💬 Four permanent public chat rooms, owner-only personal rooms, and custom public/private channels
- 🛡️ Room invitations, member limits, owner deletion, blacklists, occupancy counts, and 5/10-minute permanent activation
- 🔊 20 selectable spoken-chat profiles with sender-name announcements and French-room pronunciation
- 🔄 Forced Google cloud-roster restoration even when the browser is already signed in, plus guest-hero merge
- 🔐 Player ID + six-digit PIN continuation with corrected Supabase `extensions.pgcrypto` resolution
- 🔒 Private Player IDs visible only to their owner; all social search/invites use hero names
- 🧙 Six-slot Hero Management with create, switch, confirmed deletion, Standard, Hardcore, and Archo permanent-hero modes
- 🙏 Temple, Palace, Guild, markets, gates, streets, shops and houses are physical grid locations with no dashboard teleport shortcuts
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
| `help` | Show all commands |

## 🚀 Quick Deploy

[![Deploy to Vercel](https://vercel.com/button)](https://vercel.com/import/project?template=https://github.com/YOUR_USERNAME/black-sword-ultimate)

Or:

```bash
git clone https://github.com/YOUR_USERNAME/black-sword-ultimate.git
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

Music: Battle Explorer, Incompetech, Pixabay (Royalty Free)

## 📄 License

MIT License
