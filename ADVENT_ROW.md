# Advent Row — twenty-five date-locked Christmas doors

Advent Row is a walkable street inside Christmas City. It has **52 new rooms**: the
Advent Gate, Candy Cane Lane, twenty-five numbered stoops and twenty-five rooms
behind those stoops. Each stoop is a real place you can walk to, and each room
holds one keeper, one story, one quest, one secret word and one present.

## How the dates work

* The whole Christmas season is open **December 1 to December 25, India time**, and
  closes when December 26 begins.
* Door N opens **only** on December N. No spell, key, teleport, route or resumed
  save can pass it: the rule is checked in `Game.enterLocation`, in
  `Game.movementBlock`, and again in `AdventCalendar.open`. Anyone who tries early
  is told today's real date and hears the error sound.
* The street is rebuilt once per date, so each stoop's description tells the truth
  about that door tonight.

## Commands

| Command | What it does |
| --- | --- |
| `christmas map` | Reads the streets and says which door is open today. |
| `christmas doors` | Reads the state of all twenty-five doors and your progress. |
| `christmas open` | Opens the door you are standing in front of, if its date has come. |
| `christmas story` | The keeper reads the door's story with the recorded voice. |
| `christmas secret <word>` | Repeats the secret word hidden in the story. |
| `christmas search` / `christmas sing` / `christmas fight` / `cook` / `fish` | The door's own quest, depending on which keeper you visit. |
| `christmas present` | Opens the wrapped parcel once the quest is done. |

## Presents

Presents never contain plain gold. Each one holds diamonds plus real equipment
from `TREASURE` in `advent-calendar-v730.js` — a Starforged Blade, Hollybranch Bow,
Frostbell Hammer, Holly Mail, Frostward Helm, Midwinter Cloak, Mistletoe Ring or
Santa's Star — and a cooked winter stew. The grade of the present is raised when
you also tell the keeper the secret word, and again when the Grand Christmas Tree
is decorated. On December 25 Santa's own present at Kaliwasch Market Square grows
with the number of doors you finished.

## Voice, music and sound

Every door has its own clip at `assets/advent/story-NN.mp3`, recorded for this
game. Clips 01–10 are recorded so far; a door without a clip plays the same words
through the device voice, so a story is never missing and never silent. While a
story plays, Christmas music is ducked rather than stopped, the change is marked
with a chime, and doors, coins, pickups and rewards keep their own sounds.

`assets/fair/` now holds **sixteen** original instrumentals, produced by
`scripts/render-christmas-music.py`. They rotate only in Christmas City.

## Directions

`Announce possible directions when I return to a place` is on by default in
narrator settings and in the gesture settings panel. On a return visit you hear
*"You went north to Advent Row · Door 4. You can go north or south."* Turn it off
and only the place name is read.

Diagonal walking works three ways: the compass buttons NE, NW, SE, SW; typed or
spoken `northeast`, `north west`, `se`, and so on; or `Corner swipes walk
diagonally` in narrator settings, which maps up-right/up-left/down-right/down-left
to the four diagonals while leaving the four menus in the visible controls list.
