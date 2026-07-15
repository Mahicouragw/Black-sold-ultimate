# Public Feature Audit: The Black Sword Alexa Skill

Audit date: 2026-07-14

This project implements general RPG mechanics documented publicly for the Alexa skill. It does not copy proprietary source code, secret spells, exact maps, paid content, or dialogue.

## Public sources

1. Amazon listing: https://www.amazon.com/Narkuma-the-black-sword/dp/B07B973X4M
2. Published English command catalog: https://appperf.shirkalab.io/us/application/the-black-sword-b07b973x4m
3. Published German command catalog: https://appperf.shirkalab.io/de/application/das-schwarze-schwert-b07b973x4m
4. Public game website: https://www.theblacksword.net/website/
5. Original developer forum announcement: https://www.alefo.de/forum/rollenspiel-skill-5465

## Audited mechanics

| Publicly documented feature | Web implementation |
|---|---|
| Open world; landscapes, caves, cities | 369 connected locations and six-direction navigation |
| Monsters and combat | Level-scaled enemies, occasional 1–6/1–3 encounters, spells, groups |
| Weapons, armor, items | Sharp/blunt weapons, equipment attributes, enchantment, food, storage |
| Other heroes and conversation | Supabase profiles, public/private chat, 20 spoken voice profiles |
| Cooperative play and combat groups | Invitation-only online groups and realtime shared damage actions |
| Brotherhoods | Guild/brotherhood creation, invitations, membership |
| Companions | Recruit, dismiss, equip, give/take items, heal, train, rescue |
| Puzzles and riddles | Guild Card Test, hidden buttons, levers, locked doors, documents |
| Prayer | Temple of Auralis, favor, daily attribute/HP/MP choices |
| Hero management | Six cloud-saved heroes, restart confirmation, revival |
| Maps including player-created maps | Expanded world map, personal notes, and secure community/brotherhood markers |
| Voice-controlled play | Browser speech recognition with multilingual command aliases and typed fallback |
| Powerful artifacts and secrets | Twelve original discoverable artifacts, identification, lore journal, and attunement |
| Accessibility | Keyboard/text/voice commands, ARIA live regions, text directions, no required images |
| Mission | Quest panel, Palace quests, tutorial and command aliases |
| Use/eat/flee/goodbye/look/info | Implemented |
| Filtered inventory and gold | `inventory weapon/armor/potion/item/gold` |
| Quantity buy/sell/drop | Implemented with bounded quantities |
| Read/list/open/talk/say/examine | Context-sensitive implementations |
| Detailed status topics | Health, skills, magic, attributes, armor |
| Feedback/error report | Secure database-backed report command after v6 migration |
| Online player information | Last-ten-minute online hero list |

## Intentionally not cloned

- Secret/undisclosed Alexa spell names and solutions
- Exact proprietary maps, narrative, dialogue, riddles, or paid content
- Alexa in-skill purchases
- Alexa platform/device internals

Original equivalents are used where public evidence establishes a mechanic but not its private content.
