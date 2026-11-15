/* Black Soul Ultimate — one narration layer for English, Telugu and Hindi.
 *
 * Everything the game shows in the story log or speaks aloud passes through
 * here, so the text on screen and the text the narrator speaks always match and
 * are always in the language chosen in Settings ("Game language").
 *
 *   Narration.t('move.moved', {dir:'north', place:'Muddy Bog'})   keyed text
 *   Narration.localize('You pick up Bread!')                      older English lines
 *
 * New features use keys. Older English lines written all over the game are
 * recognised by pattern and rewritten. A line with no translation is left in
 * English and is spoken with an English voice, never garbled.
 */
(function () {
    'use strict';
    const LANGS = ['en', 'te', 'hi'];
    const TAGS = { en: 'en-US', te: 'te-IN', hi: 'hi-IN' };
    const STORE = 'black_sword_game_language';

    const DIRS = {
        north: ['north', 'ఉత్తరం', 'उत्तर'], south: ['south', 'దక్షిణం', 'दक्षिण'], east: ['east', 'తూర్పు', 'पूर्व'], west: ['west', 'పడమర', 'पश्चिम'],
        up: ['up', 'పైకి', 'ऊपर'], down: ['down', 'కిందికి', 'नीचे'], northeast: ['northeast', 'ఈశాన్యం', 'उत्तर-पूर्व'], northwest: ['northwest', 'వాయవ్యం', 'उत्तर-पश्चिम'],
        southeast: ['southeast', 'ఆగ్నేయం', 'दक्षिण-पूर्व'], southwest: ['southwest', 'నైరుతి', 'दक्षिण-पश्चिम'], in: ['in', 'లోపలికి', 'अंदर'], out: ['out', 'బయటికి', 'बाहर'],
        enter: ['enter', 'లోపలికి', 'अंदर'], exit: ['exit', 'బయటికి', 'बाहर']
    };

    /** key -> [English, Telugu, Hindi]. Feature files add their own with Narration.add(). */
    const TEXT = {
        'list.and': [' and ', ' మరియు ', ' और '],
        'list.or': [' or ', ' లేదా ', ' या '],
        'move.going': ['Going {Dir}…', '{dir} వైపు వెళ్తున్నారు…', '{dir} की ओर जा रहे हैं…'],
        'move.moved': ['You moved {dir} to {place}.', 'మీరు {dir} వైపు నడిచి {place} చేరుకున్నారు.', 'आप {dir} की ओर चलकर {place} पहुँचे।'],
        'move.noPath': ['You did not move. There is no path {dir} from {place}.', 'మీరు కదలలేదు. {place} నుండి {dir} వైపు దారి లేదు.', 'आप आगे नहीं बढ़े। {place} से {dir} की ओर कोई रास्ता नहीं है।'],
        'move.exits': ['You can go {list}.', 'మీరు వెళ్లగల దిక్కులు: {list}.', 'आप इन दिशाओं में जा सकते हैं: {list}।'],
        'move.noExits': ['There is no way out of here on foot.', 'ఇక్కడి నుండి నడిచి వెళ్లే దారి లేదు.', 'यहाँ से पैदल निकलने का कोई रास्ता नहीं है।'],
        'move.combat': ['You did not move. You are in combat and cannot go {dir} until the battle ends. Say flee to escape, or keep fighting.', 'మీరు కదలలేదు. మీరు యుద్ధంలో ఉన్నారు, పోరు ముగిసే వరకు {dir} వైపు వెళ్లలేరు. తప్పించుకోవడానికి ఫ్లీ అనండి, లేదా పోరాడండి.', 'आप आगे नहीं बढ़े। आप युद्ध में हैं और लड़ाई खत्म होने तक {dir} की ओर नहीं जा सकते। भागने के लिए फ़्ली कहें, या लड़ते रहें।'],
        'move.combatNoPath': ['You did not move. You are in combat, and there is no path {dir} from here anyway. Say flee to escape, or keep fighting.', 'మీరు కదలలేదు. మీరు యుద్ధంలో ఉన్నారు, పైగా ఇక్కడి నుండి {dir} వైపు దారి కూడా లేదు. తప్పించుకోవడానికి ఫ్లీ అనండి, లేదా పోరాడండి.', 'आप आगे नहीं बढ़े। आप युद्ध में हैं, और यहाँ से {dir} की ओर रास्ता भी नहीं है। भागने के लिए फ़्ली कहें, या लड़ते रहें।'],
        'move.lockedDoor': ['You did not move. A locked rune door blocks the way {dir}. Open it with the Alohomora spell, or break it with Multiple Strike.', 'మీరు కదలలేదు. {dir} వైపు దారిని తాళం వేసిన మంత్ర ద్వారం అడ్డుకుంటోంది. అలోహోమోరా మంత్రంతో తెరవండి, లేదా మల్టిపుల్ స్ట్రైక్‌తో పగలగొట్టండి.', 'आप आगे नहीं बढ़े। {dir} की ओर एक बंद मंत्र-द्वार रास्ता रोक रहा है। अलोहोमोरा मंत्र से खोलें, या मल्टीपल स्ट्राइक से तोड़ें।'],
        'move.houseLocked': ['You did not move. The door of this private house is locked. Buy the house from the estate agent first.', 'మీరు కదలలేదు. ఈ ఇంటి తలుపు తాళం వేసి ఉంది. ముందుగా ఎస్టేట్ ఏజెంట్ దగ్గర ఇంటిని కొనండి.', 'आप आगे नहीं बढ़े। इस निजी घर का दरवाज़ा बंद है। पहले एस्टेट एजेंट से घर खरीदें।'],
        'move.posture': ['You did not move. Stand up before walking.', 'మీరు కదలలేదు. నడిచే ముందు లేచి నిలబడండి.', 'आप आगे नहीं बढ़े। चलने से पहले खड़े हो जाएँ।'],
        'move.revival': ['You did not move. Your spirit is waiting at the Grand Temple. Pray there to return to life before you travel.', 'మీరు కదలలేదు. మీ ఆత్మ మహా దేవాలయంలో వేచి ఉంది. ప్రయాణించే ముందు అక్కడ ప్రార్థించి తిరిగి జీవం పొందండి.', 'आप आगे नहीं बढ़े। आपकी आत्मा महा मंदिर में प्रतीक्षा कर रही है। यात्रा से पहले वहाँ प्रार्थना करके जीवन पाएँ।'],
        'reward.received': ['You received {gold} rupees and {xp} experience.', 'మీకు {gold} రూపాయలు, {xp} అనుభవం లభించాయి.', 'आपको {gold} रुपये और {xp} अनुभव मिला।'],
        'lang.changed': ['Game language set to English.', 'ఆట భాష తెలుగుకు మారింది.', 'खेल की भाषा हिंदी कर दी गई है।'],
        'server.offline': ['The game server cannot be reached. Playing from this device; progress will sync when the connection returns.', 'ఆట సర్వర్ అందుబాటులో లేదు. ఈ పరికరం నుండి ఆడుతున్నారు; కనెక్షన్ తిరిగి వచ్చినప్పుడు పురోగతి సింక్ అవుతుంది.', 'गेम सर्वर से संपर्क नहीं हो पा रहा है। इस डिवाइस से खेल जारी है; कनेक्शन लौटने पर प्रगति सिंक हो जाएगी।']
    };

    /** Older English lines, rewritten by pattern. [regex, Telugu, Hindi]; $1.. are captures. */
    const PATTERNS = [
        [/^📍 You are at: (.+)$/, '📍 మీరు ఉన్న చోటు: $1', '📍 आप यहाँ हैं: $1'],
        [/^You are in (.+)\.$/, 'మీరు $1 లో ఉన్నారు.', 'आप $1 में हैं।'],
        [/^(?:Exits|Directions|Available directions): (.+)$/, 'దిక్కులు: $D1', 'दिशाएँ: $D1'],
        [/^No exits from here\.$/, 'ఇక్కడి నుండి దారులు లేవు.', 'यहाँ से कोई रास्ता नहीं है।'],
        [/^You encounter (.+)\.$/, 'మీకు $1 ఎదురైంది.', 'आपका सामना $1 से हुआ।'],
        [/^You hunt the (.+)!$/, 'మీరు $1 ను వేటాడుతున్నారు!', 'आप $1 का शिकार कर रहे हैं!'],
        [/^You attack for (\d+) damage!(.*)$/, 'మీరు దాడి చేసి $1 నష్టం కలిగించారు!$2', 'आपने हमला करके $1 चोट पहुँचाई!$2'],
        [/^You CRITICALLY attack for (\d+) damage!(.*)$/, 'మీరు తీవ్రమైన దెబ్బ కొట్టి $1 నష్టం కలిగించారు!$2', 'आपने ज़ोरदार वार करके $1 चोट पहुँचाई!$2'],
        [/^Your attack misses (.+)!$/, 'మీ దాడి $1 కు తగలలేదు!', 'आपका वार $1 को नहीं लगा!'],
        [/^(.+) hits you for (\d+) damage!$/, '$1 మిమ్మల్ని కొట్టి $2 నష్టం కలిగించింది!', '$1 ने आपको $2 चोट पहुँचाई!'],
        [/^(.+) attacks but you dodge the blow!$/, '$1 దాడి చేసింది, కానీ మీరు తప్పించుకున్నారు!', '$1 ने हमला किया, पर आप बच गए!'],
        [/^(.+) braces its defenses!$/, '$1 రక్షణకు సిద్ధమైంది!', '$1 ने बचाव की मुद्रा ली!'],
        [/^(.+) strikes for (\d+) damage!$/, '$1 దాడి చేసి $2 నష్టం కలిగించారు!', '$1 ने वार करके $2 चोट पहुँचाई!'],
        [/^(.+) heals you for (\d+) HP\.$/, '$1 మీకు $2 ఆరోగ్యం తిరిగి ఇచ్చారు.', '$1 ने आपका $2 स्वास्थ्य लौटाया।'],
        [/^(.+) has fallen in battle!$/, '$1 యుద్ధంలో పడిపోయారు!', '$1 युद्ध में गिर गए!'],
        [/^🎉 (.+) defeated! \+(\d+) XP, \+(\d+) gold(.*)$/, '🎉 $1 ఓడిపోయింది! +$2 అనుభవం, +$3 రూపాయలు$4', '🎉 $1 हार गया! +$2 अनुभव, +$3 रुपये$4'],
        [/^⬆️ LEVEL UP! You are now level (\d+)!$/, '⬆️ స్థాయి పెరిగింది! ఇప్పుడు మీ స్థాయి $1!', '⬆️ स्तर बढ़ा! अब आपका स्तर $1 है!'],
        [/^You pick up (.+)!$/, 'మీరు $1 తీసుకున్నారు!', 'आपने $1 उठाया!'],
        [/^Received: (.+)!$/, 'లభించింది: $1!', 'मिला: $1!'],
        [/^You see: (.+)$/, 'మీకు కనిపిస్తున్నవి: $1', 'आपको दिख रहा है: $1'],
        [/^Equipped (.+)\.$/, '$1 ధరించారు.', '$1 धारण किया।'],
        [/^Unequipped (.+)\. It remains in your inventory\.$/, '$1 తీసేశారు. అది మీ సంచిలోనే ఉంది.', '$1 उतार दिया। वह आपके थैले में है।'],
        [/^Your bag is empty\.$/, 'మీ సంచి ఖాళీగా ఉంది.', 'आपका थैला खाली है।'],
        [/^In your bag: (.+)\.$/, 'మీ సంచిలో: $1.', 'आपके थैले में: $1।'],
        [/^Bought (\d+) × (.+) for (\d+) rupees\.$/, '$2 × $1 ను $3 రూపాయలకు కొన్నారు.', '$2 × $1, $3 रुपये में खरीदा।'],
        [/^Sold (.+) for (\d+) gold\.$/, '$1 ను $2 రూపాయలకు అమ్మారు.', '$1 को $2 रुपये में बेचा।'],
        [/^Not enough rupees\. You need (\d+) but have (\d+)\.$/, 'రూపాయలు సరిపోవు. $1 కావాలి, మీ దగ్గర $2 ఉన్నాయి.', 'रुपये कम हैं। $1 चाहिए, आपके पास $2 हैं।'],
        [/^Your health is already full\.$/, 'మీ ఆరోగ్యం ఇప్పటికే పూర్తిగా ఉంది.', 'आपका स्वास्थ्य पहले से पूरा है।'],
        [/^Your magic is already full\.$/, 'మీ మంత్రశక్తి ఇప్పటికే పూర్తిగా ఉంది.', 'आपकी जादुई शक्ति पहले से पूरी है।'],
        [/^Your health and magic are already full\.$/, 'మీ ఆరోగ్యం, మంత్రశక్తి ఇప్పటికే పూర్తిగా ఉన్నాయి.', 'आपका स्वास्थ्य और जादुई शक्ति पहले से पूरी है।'],
        [/^✨ You cast (.+)\. Healed (\d+) HP!$/, '✨ మీరు $1 ప్రయోగించారు. $2 ఆరోగ్యం తిరిగి వచ్చింది!', '✨ आपने $1 का प्रयोग किया। $2 स्वास्थ्य लौटा!'],
        [/^(.+) says: "(.+)"$/, '$1 ఇలా అన్నారు: "$2"', '$1 ने कहा: "$2"'],
        [/^(.+) joined your combat group!$/, '$1 మీ యుద్ధ బృందంలో చేరారు!', '$1 आपके युद्ध दल में शामिल हुए!'],
        [/^(.+) is already in your group\.$/, '$1 ఇప్పటికే మీ బృందంలో ఉన్నారు.', '$1 पहले से आपके दल में हैं।'],
        [/^Your combat group is full \(maximum 3 companions\)\.$/, 'మీ యుద్ధ బృందం నిండిపోయింది (గరిష్ఠంగా 3 సహచరులు).', 'आपका युद्ध दल भरा है (अधिकतम 3 साथी)।'],
        [/^📜 Quest Complete: (.+)!$/, '📜 కార్యం పూర్తయింది: $1!', '📜 कार्य पूरा हुआ: $1!'],
        [/^You are full\.$/, 'మీ కడుపు నిండుగా ఉంది.', 'आपका पेट भरा है।'],
        [/^You are not hungry\.$/, 'మీకు ఆకలిగా లేదు.', 'आपको भूख नहीं है।'],
        [/^You are getting hungry\.$/, 'మీకు ఆకలి మొదలవుతోంది.', 'आपको भूख लगने लगी है।'],
        [/^The door closes\.$/, 'తలుపు మూసుకుంది.', 'दरवाज़ा बंद हो गया।'],
        [/^Cloud save requested\.$/, 'క్లౌడ్ సేవ్ అభ్యర్థించబడింది.', 'क्लाउड सेव का अनुरोध भेजा गया।']
    ];

    const cache = new Map();
    const N = {
        LANGS, TAGS,
        lang() {
            let value = 'en';
            try { value = localStorage.getItem(STORE) || 'en'; } catch { /* private mode */ }
            return LANGS.includes(value) ? value : 'en';
        },
        index() { return LANGS.indexOf(this.lang()); },
        /** Voice language for a piece of text, judged by its script so that an
         *  untranslated English line is never read by a Telugu or Hindi voice. */
        tagFor(text) {
            const s = String(text || '');
            if (/[\u0C00-\u0C7F]/.test(s)) return TAGS.te;
            if (/[\u0900-\u097F]/.test(s)) return TAGS.hi;
            return TAGS.en;
        },
        add(entries) { Object.assign(TEXT, entries); cache.clear(); },
        has(key) { return Object.prototype.hasOwnProperty.call(TEXT, key); },
        dir(direction, lang = this.lang()) {
            const key = String(direction || '').toLowerCase(), row = DIRS[key];
            return row ? row[Math.max(0, LANGS.indexOf(lang))] : String(direction || '');
        },
        list(items, joiner = 'and') {
            const parts = items.filter(Boolean).map(String);
            if (parts.length <= 1) return parts.join('');
            return parts.slice(0, -1).join(', ') + this.t('list.' + joiner) + parts[parts.length - 1];
        },
        /** Keyed text in the chosen language. Params named dir/Dir are direction words. */
        t(key, params = {}, lang = this.lang()) {
            const row = TEXT[key];
            if (!row) return String(key);
            const template = row[Math.max(0, LANGS.indexOf(lang))] || row[0];
            return template.replace(/\{(\w+)\}/g, (whole, name) => {
                if (name === 'dir') return this.dir(params.dir, lang);
                if (name === 'Dir') { const word = this.dir(params.dir, lang); return word.charAt(0).toUpperCase() + word.slice(1); }
                return params[name] === undefined || params[name] === null ? '' : String(params[name]);
            });
        },
        /** Rewrite an older English line into the chosen language when we know how. */
        localize(text) {
            const lang = this.lang();
            if (lang === 'en' || typeof text !== 'string' || !text || this.tagFor(text) !== TAGS.en) return text;
            const hit = cache.get(lang + '|' + text);
            if (hit !== undefined) return hit;
            let out = text;
            const column = lang === 'te' ? 1 : 2;
            for (const row of PATTERNS) {
                const match = row[0].exec(text);
                if (!match) continue;
                out = row[column].replace(/\$D(\d)/g, (w, i) => String(match[+i] || '').split(/,\s*/).map(part => this.dir(part.trim(), lang)).join(', '))
                    .replace(/\$(\d)/g, (w, i) => match[+i] === undefined ? '' : match[+i]);
                break;
            }
            if (cache.size > 400) cache.clear();
            cache.set(lang + '|' + text, out);
            return out;
        },
        setLang(value, { announce = true } = {}) {
            if (!LANGS.includes(value)) value = 'en';
            try { localStorage.setItem(STORE, value); } catch { /* private mode */ }
            if (window.TranslationService) window.TranslationService.target = value;
            const select = document.getElementById('game-language');
            if (select && select.value !== value && [...select.options].some(o => o.value === value)) select.value = value;
            document.documentElement.setAttribute('data-game-language', value);
            cache.clear();
            window.dispatchEvent(new CustomEvent('bsu-language', { detail: value }));
            if (announce) this.say(this.t('lang.changed'), 'system', { critical: true });
        },
        /** Show a line in the story log and speak it once, in the chosen language. */
        say(text, type = 'system', options = {}) {
            const G = window.Game;
            if (!text) return Promise.resolve(false);
            if (G?.emitGameEvent) return G.emitGameEvent(text, type, options);
            if (G?.addNarrative) G.addNarrative(text, type);
            return Promise.resolve(true);
        },
        /** Keyed line straight to the log and the narrator. */
        tell(key, params, type = 'system', options = {}) { return this.say(this.t(key, params), type, options); },
        /** Speak without adding to the story log (panels that have their own live region). */
        speak(text, { critical = false, channel = '' } = {}) {
            const A = window.AudioManager;
            if (!text || !A?.playVoice) return Promise.resolve(false);
            return A.playVoice(String(text), { priority: critical ? 'critical' : false, channel });
        }
    };
    window.Narration = N;

    function wire() {
        const G = window.Game, A = window.AudioManager;
        if (G && !G._narrationLayer) {
            G._narrationLayer = true;
            // Outermost wrapper: every caller, old or new, gets the same text on
            // screen that the narrator is about to speak.
            const inner = G.addNarrative;
            G.addNarrative = function (text, type) { return inner.call(this, N.localize(text), type); };
        }
        if (A && !A._narrationLayer && typeof A.enqueueAudioEvent === 'function') {
            A._narrationLayer = true;
            const enqueue = A.enqueueAudioEvent.bind(A);
            A.enqueueAudioEvent = function (event = {}) {
                if (!event || !event.text) return enqueue(event);
                const text = N.localize(String(event.text));
                const language = event.language && event.language !== 'en-US' ? event.language : N.tagFor(text);
                return enqueue({ ...event, text, language });
            };
        }
        const select = document.getElementById('game-language');
        if (select && !select.dataset.narrationBound) {
            select.dataset.narrationBound = 'true';
            select.addEventListener('change', event => { if (LANGS.includes(event.target.value)) N.setLang(event.target.value); else document.documentElement.setAttribute('data-game-language', 'en'); });
        }
        document.documentElement.setAttribute('data-game-language', N.lang());
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();
    window.addEventListener('load', wire);
})();
