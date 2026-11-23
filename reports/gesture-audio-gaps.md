# Recorded sound effects: what exists, what is still missing

The project uses **real recordings only**. Nothing in this list is generated,
synthesised or produced by a web audio API, and a missing recording is reported
here instead of being replaced with a fake.

## Present (bundled, credited in `AUDIO_CREDITS.md`)

| Need | Recording |
|---|---|
| Walking on stone | `assets/audio/sfx/step-stone.ogg` |
| Walking on wood / indoors | `assets/audio/sfx/step-wood.ogg` |
| Walking on gravel, paths, mountain trails | `assets/audio/sfx/step-gravel.ogg` |
| Walking on leaves / grass / forest floor | `assets/audio/sfx/step-leaves-1.ogg`, `step-leaves-2.ogg` |
| Walking on mud / swamp | `assets/audio/sfx/step-mud.ogg` |
| Door opening and closing | `assets/audio/sfx/door.wav` |
| Item pickup | `assets/audio/sfx/pickup.wav` |
| Wind outdoors | `assets/audio/sfx/haunted-wind.wav` |
| Gesture acknowledgement (real whoosh) | `assets/audio/sfx/music-transition.wav` (the `swipe` sound) |
| Combat, magic, coins, chests with existing coverage | see `music.js` sound registry |

Surface choice is made by `Game.getFootstepSFX()` from the room's real name,
region, description and features, so footsteps already match the room, and the
blocked-move sound is separate from the success sound.

## Missing — reported, not faked

| Required recording | Used for | Current honest behaviour |
|---|---|---|
| Snow footsteps | Christmas village and snowy streets | Falls back to the stone/gravel recording and reads the surface in narration; no snow sound is invented |
| Ice footsteps | Frozen lake, ice bridges | Falls back as above |
| Locked-door rattle | Trying a locked door | The door does **not** play the open sound; the refusal is spoken, and no rattle is faked |
| Failed door opening | A door that will not open | Speech only |
| Chest opening | Treasure chests | Existing pickup/coin recordings are used; no chest creak is invented |
| Cave ambience | Underground chambers | The wind recording is used only where wind is plausible; the cave has no dedicated ambience |
| Water / stream / lake | Rivers, lake shore | No water loop exists, so none is played |

To close these gaps, drop verified CC0/CC BY recordings into `assets/audio/sfx/`
with the same naming pattern, register them in `music.js`, add them to the
service-worker precache list, and update `AUDIO_CREDITS.md`. No code change is
needed beyond the registry entry.
