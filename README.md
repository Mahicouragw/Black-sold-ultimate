# ⚔️ The Black Sword Chronicles - Ultimate Edition

An open-world multiplayer RPG inspired by "The Black Sword" on Amazon Alexa. Features real royalty-free ambient music, enhanced combat, guilds, quests, and more!

## 🎵 Music and Sound Credits

The game now bundles real cinematic music and recorded RPG sound effects from **OpenGameArt**, all released under **CC0 / public domain**. It no longer generates procedural oscillator music.

See [`AUDIO_CREDITS.md`](AUDIO_CREDITS.md) for every track, creator, source page, and license.

## 🎮 Features

- 🌍 Open World Exploration (109 locations across the original realm + 12 expanded regions)
- 👹 122 monster types and bosses
- 🛒 24 location shops using rupees
- 👥 Multiplayer Pass & Play (2-4 players)
- ⚔️ Turn-Based Combat with spells and up to 3 fighting companions
- 💬 Real online chat and friend-request send/accept/reject flows through Supabase
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
