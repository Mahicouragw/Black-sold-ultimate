// Recorded character dialogue is independent of the narrator and system TTS.
(() => {
    const cast = new Map([
        ["Tavern Keeper Greta", ["tavern-keeper-greta", new Map([
            ["Care for an ale, adventurer?", "0"],
            ["I hear strange things are happening in the dungeon...", "1"],
            ["Sit yourself down and rest!", "2"],
            ["Travelers whisper that the deep places stir again. Keep your sword close.", "3"]
        ])]],
        ["Guild Master Helena", ["guild-master-helena", new Map([
            ["Ah, a new adventurer!", "0"],
            ["Defeat the Shadow Lord to prove your worth!", "1"],
            ["The guild has many quests for brave heroes.", "2"],
            ["The realm's need is great — Ancient Knowledge still calls for a hero.", "3"],
            ["The realm's need is great — Defeat the Shadow Lord still calls for a hero.", "4"],
            ["The realm's need is great — First Blood still calls for a hero.", "5"],
            ["The realm's need is great — King of the Skies still calls for a hero.", "6"],
            ["The realm's need is great — The Black Sword still calls for a hero.", "7"],
            ["The realm's need is great — The Goblin Problem still calls for a hero.", "8"],
            ["The realm's need is great — Welcome to Kaliwasch still calls for a hero.", "9"]
        ])]],
        ["Temple Priest", ["temple-priest", new Map([
            ["May the light guide your path.", "0"],
            ["Need healing? The temple offers blessings for a small donation.", "1"],
            ["The altar of Auralis is always lit. Quick heal draws on its light.", "2"],
            ["The gods watch over us all.", "3"]
        ])]],
        ["Ember Coast Guide", ["ember-coast-guide", new Map([
            ["The guild pays well for monster trophies.", "0"],
            ["Use the waystones and keep your party close.", "1"],
            ["Welcome to Ember Coast.", "2"]
        ])]],
        ["Lyra Dawnstep", ["lyra-dawnstep", new Map([
            ["A strong party survives together.", "0"],
            ["I could use a worthy traveling partner.", "1"],
            ["Invite me and I will fight beside you.", "2"]
        ])]],
        ["Moonwood Guide", ["moonwood-guide", new Map([
            ["The guild pays well for monster trophies.", "0"],
            ["Use the waystones and keep your party close.", "1"],
            ["Welcome to Moonwood.", "2"]
        ])]],
        ["Brother Cael", ["brother-cael", new Map([
            ["A strong party survives together.", "0"],
            ["I could use a worthy traveling partner.", "1"],
            ["Invite me and I will fight beside you.", "2"]
        ])]],
        ["Sunscar Desert Guide", ["sunscar-desert-guide", new Map([
            ["The guild pays well for monster trophies.", "0"],
            ["Use the waystones and keep your party close.", "1"],
            ["Welcome to Sunscar Desert.", "2"]
        ])]],
        ["Brakka Ironhand", ["brakka-ironhand", new Map([
            ["A strong party survives together.", "0"],
            ["I could use a worthy traveling partner.", "1"],
            ["Invite me and I will fight beside you.", "2"]
        ])]],
        ["Frostmarch Guide", ["frostmarch-guide", new Map([
            ["The guild pays well for monster trophies.", "0"],
            ["Use the waystones and keep your party close.", "1"],
            ["Welcome to Frostmarch.", "2"]
        ])]],
        ["Nim Vex", ["nim-vex", new Map([
            ["A strong party survives together.", "0"],
            ["I could use a worthy traveling partner.", "1"],
            ["Invite me and I will fight beside you.", "2"]
        ])]],
        ["Storm Isles Guide", ["storm-isles-guide", new Map([
            ["The guild pays well for monster trophies.", "0"],
            ["Use the waystones and keep your party close.", "1"],
            ["Welcome to Storm Isles.", "2"]
        ])]],
        ["Jade Lowlands Guide", ["jade-lowlands-guide", new Map([
            ["The guild pays well for monster trophies.", "0"],
            ["Use the waystones and keep your party close.", "1"],
            ["Welcome to Jade Lowlands.", "2"]
        ])]],
        ["Ashen Vale Guide", ["ashen-vale-guide", new Map([
            ["The guild pays well for monster trophies.", "0"],
            ["Use the waystones and keep your party close.", "1"],
            ["Welcome to Ashen Vale.", "2"]
        ])]],
        ["Crystal Reach Guide", ["crystal-reach-guide", new Map([
            ["The guild pays well for monster trophies.", "0"],
            ["Use the waystones and keep your party close.", "1"],
            ["Welcome to Crystal Reach.", "2"]
        ])]],
        ["Whispering Steppe Guide", ["whispering-steppe-guide", new Map([
            ["The guild pays well for monster trophies.", "0"],
            ["Use the waystones and keep your party close.", "1"],
            ["Welcome to Whispering Steppe.", "2"]
        ])]],
        ["Ironroot Wilds Guide", ["ironroot-wilds-guide", new Map([
            ["The guild pays well for monster trophies.", "0"],
            ["Use the waystones and keep your party close.", "1"],
            ["Welcome to Ironroot Wilds.", "2"]
        ])]],
        ["Starfall Basin Guide", ["starfall-basin-guide", new Map([
            ["The guild pays well for monster trophies.", "0"],
            ["Use the waystones and keep your party close.", "1"],
            ["Welcome to Starfall Basin.", "2"]
        ])]],
        ["Void Frontier Guide", ["void-frontier-guide", new Map([
            ["The guild pays well for monster trophies.", "0"],
            ["Use the waystones and keep your party close.", "1"],
            ["Welcome to Void Frontier.", "2"]
        ])]],
        ["Elder of Willowbrook", ["elder-of-willowbrook", new Map([
            ["Our gates are open to honorable heroes.", "0"],
            ["The Palace sends new missions each week.", "1"],
            ["Welcome to Willowbrook.", "2"]
        ])]],
        ["Elder of Stonefield", ["elder-of-stonefield", new Map([
            ["Our gates are open to honorable heroes.", "0"],
            ["The Palace sends new missions each week.", "1"],
            ["Welcome to Stonefield.", "2"]
        ])]],
        ["Elder of Redhaven", ["elder-of-redhaven", new Map([
            ["Our gates are open to honorable heroes.", "0"],
            ["The Palace sends new missions each week.", "1"],
            ["Welcome to Redhaven.", "2"]
        ])]],
        ["Elder of Moonmeadow", ["elder-of-moonmeadow", new Map([
            ["Our gates are open to honorable heroes.", "0"],
            ["The Palace sends new missions each week.", "1"],
            ["Welcome to Moonmeadow.", "2"]
        ])]],
        ["Elder of Ironford", ["elder-of-ironford", new Map([
            ["Our gates are open to honorable heroes.", "0"],
            ["The Palace sends new missions each week.", "1"],
            ["Welcome to Ironford.", "2"]
        ])]],
        ["Elder of Greenhollow", ["elder-of-greenhollow", new Map([
            ["Our gates are open to honorable heroes.", "0"],
            ["The Palace sends new missions each week.", "1"],
            ["Welcome to Greenhollow.", "2"]
        ])]],
        ["Elder of Frostmere", ["elder-of-frostmere", new Map([
            ["Our gates are open to honorable heroes.", "0"],
            ["The Palace sends new missions each week.", "1"],
            ["Welcome to Frostmere.", "2"]
        ])]],
        ["Elder of Amberwick", ["elder-of-amberwick", new Map([
            ["Our gates are open to honorable heroes.", "0"],
            ["The Palace sends new missions each week.", "1"],
            ["Welcome to Amberwick.", "2"]
        ])]],
        ["Elder of Oakrest", ["elder-of-oakrest", new Map([
            ["Our gates are open to honorable heroes.", "0"],
            ["The Palace sends new missions each week.", "1"],
            ["Welcome to Oakrest.", "2"]
        ])]],
        ["Elder of Starling", ["elder-of-starling", new Map([
            ["Our gates are open to honorable heroes.", "0"],
            ["The Palace sends new missions each week.", "1"],
            ["Welcome to Starling.", "2"]
        ])]],
        ["Kaliwasch Estate Agent", ["kaliwasch-estate-agent", new Map([
            ["A private house costs 1200 rupees.", "0"],
            ["Only the owner can enter and use house storage.", "1"],
            ["Property tax is due every seven days.", "2"]
        ])]],
        ["Aurora City Estate Agent", ["aurora-city-estate-agent", new Map([
            ["A private house costs 1500 rupees.", "0"],
            ["Only the owner can enter and use house storage.", "1"],
            ["Property tax is due every seven days.", "2"]
        ])]],
        ["Ironspire City Estate Agent", ["ironspire-city-estate-agent", new Map([
            ["A private house costs 1800 rupees.", "0"],
            ["Only the owner can enter and use house storage.", "1"],
            ["Property tax is due every seven days.", "2"]
        ])]],
        ["Seabreeze City Estate Agent", ["seabreeze-city-estate-agent", new Map([
            ["A private house costs 1600 rupees.", "0"],
            ["Only the owner can enter and use house storage.", "1"],
            ["Property tax is due every seven days.", "2"]
        ])]],
        ["Kaliwasch Guild Registrar", ["kaliwasch-guild-registrar", new Map([
            ["Guild management is available to linked heroes.", "0"],
            ["The quest board and training rooms are open.", "1"],
            ["The realm's need is great — Ancient Knowledge still calls for a hero.", "2"],
            ["The realm's need is great — Defeat the Shadow Lord still calls for a hero.", "3"],
            ["The realm's need is great — First Blood still calls for a hero.", "4"],
            ["The realm's need is great — King of the Skies still calls for a hero.", "5"],
            ["The realm's need is great — The Black Sword still calls for a hero.", "6"],
            ["The realm's need is great — The Goblin Problem still calls for a hero.", "7"],
            ["The realm's need is great — Welcome to Kaliwasch still calls for a hero.", "8"],
            ["Welcome to the Adventurers Guild.", "9"]
        ])]],
        ["Kaliwasch Tavern Keeper", ["kaliwasch-tavern-keeper", new Map([
            ["A room and meal cost 10 rupees.", "0"],
            ["Rest restores HP and MP.", "1"],
            ["Travelers exchange rumors here.", "2"],
            ["Travelers whisper that the deep places stir again. Keep your sword close.", "3"]
        ])]],
        ["Aurora City Guild Registrar", ["aurora-city-guild-registrar", new Map([
            ["Guild management is available to linked heroes.", "0"],
            ["The quest board and training rooms are open.", "1"],
            ["The realm's need is great — Ancient Knowledge still calls for a hero.", "2"],
            ["The realm's need is great — Defeat the Shadow Lord still calls for a hero.", "3"],
            ["The realm's need is great — First Blood still calls for a hero.", "4"],
            ["The realm's need is great — King of the Skies still calls for a hero.", "5"],
            ["The realm's need is great — The Black Sword still calls for a hero.", "6"],
            ["The realm's need is great — The Goblin Problem still calls for a hero.", "7"],
            ["The realm's need is great — Welcome to Kaliwasch still calls for a hero.", "8"],
            ["Welcome to the Adventurers Guild.", "9"]
        ])]],
        ["Aurora City Tavern Keeper", ["aurora-city-tavern-keeper", new Map([
            ["A room and meal cost 10 rupees.", "0"],
            ["Rest restores HP and MP.", "1"],
            ["Travelers exchange rumors here.", "2"],
            ["Travelers whisper that the deep places stir again. Keep your sword close.", "3"]
        ])]],
        ["Ironspire City Guild Registrar", ["ironspire-city-guild-registrar", new Map([
            ["Guild management is available to linked heroes.", "0"],
            ["The quest board and training rooms are open.", "1"],
            ["The realm's need is great — Ancient Knowledge still calls for a hero.", "2"],
            ["The realm's need is great — Defeat the Shadow Lord still calls for a hero.", "3"],
            ["The realm's need is great — First Blood still calls for a hero.", "4"],
            ["The realm's need is great — King of the Skies still calls for a hero.", "5"],
            ["The realm's need is great — The Black Sword still calls for a hero.", "6"],
            ["The realm's need is great — The Goblin Problem still calls for a hero.", "7"],
            ["The realm's need is great — Welcome to Kaliwasch still calls for a hero.", "8"],
            ["Welcome to the Adventurers Guild.", "9"]
        ])]],
        ["Ironspire City Tavern Keeper", ["ironspire-city-tavern-keeper", new Map([
            ["A room and meal cost 10 rupees.", "0"],
            ["Rest restores HP and MP.", "1"],
            ["Travelers exchange rumors here.", "2"],
            ["Travelers whisper that the deep places stir again. Keep your sword close.", "3"]
        ])]],
        ["Seabreeze City Guild Registrar", ["seabreeze-city-guild-registrar", new Map([
            ["Guild management is available to linked heroes.", "0"],
            ["The quest board and training rooms are open.", "1"],
            ["The realm's need is great — Ancient Knowledge still calls for a hero.", "2"],
            ["The realm's need is great — Defeat the Shadow Lord still calls for a hero.", "3"],
            ["The realm's need is great — First Blood still calls for a hero.", "4"],
            ["The realm's need is great — King of the Skies still calls for a hero.", "5"],
            ["The realm's need is great — The Black Sword still calls for a hero.", "6"],
            ["The realm's need is great — The Goblin Problem still calls for a hero.", "7"],
            ["The realm's need is great — Welcome to Kaliwasch still calls for a hero.", "8"],
            ["Welcome to the Adventurers Guild.", "9"]
        ])]],
        ["Seabreeze City Tavern Keeper", ["seabreeze-city-tavern-keeper", new Map([
            ["A room and meal cost 10 rupees.", "0"],
            ["Rest restores HP and MP.", "1"],
            ["Travelers exchange rumors here.", "2"],
            ["Travelers whisper that the deep places stir again. Keep your sword close.", "3"]
        ])]],
        ["Mechanic Torque", ["mechanic-torque", new Map([
            ["Keep your condition high and your lap times will drop.", "0"],
            ["Pick a car, and I can repair or upgrade it for you.", "1"],
            ["Welcome to the racing garage.", "2"]
        ])]],
        ["Garage Owner Vara", ["garage-owner-vara", new Map([
            ["Every new driver gets a free starter car.", "0"],
            ["Select your car here and it will be ready whenever you return.", "1"],
            ["This garage is yours to use.", "2"]
        ])]],
        ["Dealer Jinx", ["dealer-jinx", new Map([
            ["I have several fine cars for sale — listen to each one.", "0"],
            ["Tell me what you want to buy and I will name the price.", "1"],
            ["Welcome to the dealership.", "2"]
        ])]],
        ["Race Organizer Petra", ["race-organizer-petra", new Map([
            ["Finish races to earn coins and unlock new tracks.", "0"],
            ["Ready for your first race?", "1"],
            ["The beginner circuit is a good place to start.", "2"]
        ])]],
        ["District Guide", ["district-guide", new Map([
            ["The garage is north, the dealership northeast, the practice track west, and the race tracks south.", "0"],
            ["Type \"drive\" to get behind the wheel.", "1"],
            ["Welcome to the Car Racing District.", "2"]
        ])]],
        ["King Aldric", ["king-aldric", new Map([
            ["A hero who eats, rests and prays will serve the realm for many years.", "0"],
            ["Kandor has need of you, hero. Say palace quest and I will give you a task.", "1"],
            ["Return to me when your task is done and you will be rewarded.", "2"]
        ])]],
        ["Captain Marcus", ["captain-marcus", new Map([
            ["If a fight turns against you, pray. I have seen angels answer a hero whose strength was almost gone.", "0"],
            ["Never go into a hard fight hungry. A weak arm loses battles.", "1"],
            ["The Royal Guard stands ready.", "2"]
        ])]],
        ["Royal Steward", ["royal-steward", new Map([
            ["The armory, the library and the courtyard open from the entrance hall, to the south.", "0"],
            ["The chapel is to the west if you wish to pray.", "1"],
            ["Welcome to the palace. The King receives heroes in the throne room, to the north.", "2"]
        ])]],
        ["Palace Chaplain", ["palace-chaplain", new Map([
            ["A daily blessing is given once each day. Come back tomorrow for the next one.", "0"],
            ["When your health is nearly gone, pray wherever you stand. Four angels will come.", "1"],
            ["You may pray here as in any temple. Say pray.", "2"]
        ])]],
        ["Royal Armorer", ["royal-armorer", new Map([
            ["Good steel for the servants of the crown. Say shop to see my stock.", "0"],
            ["Keep your weapon equipped. A blade in the bag wins no fights.", "1"],
            ["My shelves hold supplies for every road. Gold buys what steel cannot.", "2"]
        ])]],
        ["Royal Archivist", ["royal-archivist", new Map([
            ["Health and magic return slowly with time, one point each minute, even while you are away.", "0"],
            ["Say where am I at any time to hear the exits around you.", "1"],
            ["The temple gives one blessing each day, and one lasting blessing in a lifetime. Choose it with care.", "2"],
            ["Time passes in this realm as it does in yours. A good meal keeps hunger away for hours.", "3"]
        ])]],
        ["Drill Sergeant", ["drill-sergeant", new Map([
            ["Feet apart, shield up! Say defend to raise your guard in a fight.", "0"],
            ["Know when to flee. A living hero can fight again tomorrow.", "1"]
        ])]],
        ['Palace Courier', ['courier', new Map([
            ['I carry dispatches between the entrance hall and the library.', 'route'],
            ['The Royal Archivist keeps the dispatches on the library shelves.', 'archive']
        ])]],
        ['Merchant Aldric', ['aldric', new Map([
            ['Welcome to my shop, traveler!', 'welcome'],
            ["I've got the finest wares in all the realm!", 'wares'],
            ['May fortune smile upon your journey.', 'fortune'],
            ['My shelves hold supplies for every road. Gold buys what steel cannot.', 'gold']
        ])]]
    ]);
    /* ── Live character voices ─────────────────────────────────────────────
       Recorded clips only ever cover a fixed script line. Everything else an
       NPC says is spoken by the device voice reading the exact words on the
       screen, so any answer to any question can be heard — like TalkBack or a
       chat assistant reading its reply, but with this character's own pitch,
       speed and preferred system voice. */
    const liveHash = name => {
        let h = 2166136261;
        for (const ch of String(name || '')) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
        return h >>> 0;
    };
    window.CharacterVoices = {
        /** A stable device-voice profile for one character name. */
        profile(name) {
            const hash = liveHash(name);
            let voices = [];
            try { voices = (window.speechSynthesis?.getVoices?.() || []).filter(v => /^en/i.test(v.lang || '')); } catch { voices = []; }
            const chosen = voices.length ? voices[(hash >>> 7) % voices.length] : null;
            return {
                voiceId: chosen ? `system:${chosen.name}` : 'system:default',
                voice: chosen?.name || '',
                pitch: Number((0.80 + ((hash >>> 3) % 41) / 100).toFixed(2)),
                rate: Number((0.90 + ((hash >>> 11) % 21) / 100).toFixed(2))
            };
        },
        /** Read text aloud in this character's voice; returns the audio promise. */
        speak(name, text) {
            const words = String(text || '').trim();
            const audio = window.AudioManager || window.MusicSystem;
            if (!audio || !words) return Promise.resolve(false);
            return audio.enqueueAudioEvent({
                text: words,
                ...this.profile(name),
                channel: `npc:${name}`,
                priority: true,
                requireVoice: true,
                character: true
            });
        }
    };

    const deeds = ' Your deeds are already spoken of across the city.';
    const key = 'bsu.characterRecordings';
    const stop = () => window.AudioManager.stopCharacterVoice();
    window.CharacterRecordings = {
        bind() {
            const box = document.getElementById('setting-character-recordings');
            box.checked = localStorage.getItem(key) !== 'off';
            box.onchange = () => {
                if (!box.checked) stop();
                localStorage.setItem(key, box.checked ? 'on' : 'off');
            };
        },
        /** Every recorded line this character owns, so callers can choose one
         *  instead of guessing at a clip that does not exist. */
        lines(name) { const actor = cast.get(name); return actor ? [...actor[1].keys()] : []; },
        has(name, text) { const actor = cast.get(name); return Boolean(actor && actor[1].has(text)); },
        /** Play a recorded line if it exists. Returns true only when audio started. */
        speak(name, text) { return this.play(name, text); },
        play(name, text) {
            stop();
            const actor = cast.get(name);
            if (!actor || !document.getElementById('setting-character-recordings').checked ||
                (document.documentElement.dataset.gameLanguage || 'en') !== 'en') return false;
            const extra = text.endsWith(deeds);
            const line = actor[1].get(extra ? text.slice(0,-deeds.length) : text);
            if (!line) return false;
            const clips = extra ? [line, 'deeds'] : [line];
            window.AudioManager.playCharacterVoice(clips.map(id => `assets/voices/${actor[0]}-${id}.mp3`));
            return true;
        }
    };
    window.addEventListener('pagehide', stop);
})();
