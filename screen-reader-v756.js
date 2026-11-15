/**
 * Black Sword Ultimate v7.56 — menus and panels that a screen reader can hear.
 *
 * The story log was the only part of the game that spoke by itself. Opening
 * Items, Stats, Map, Quests, Settings and the other panels changed the screen
 * silently: nothing was announced and the screen reader stayed on the button
 * that had been pressed. This file fixes that in one place for every panel:
 *
 *   - When a panel opens, focus moves to its heading, and the heading says
 *     what opened, how much is in it and how to read and close it.
 *   - When a panel closes, focus returns to the button that opened it and
 *     "… closed" is announced.
 *   - When a panel redraws itself (after buying, using or equipping), focus
 *     stays inside the panel instead of being lost.
 *   - Changing screen (title, hero creation, help …) moves focus to the new
 *     screen's heading.
 *   - Location actions are announced when they change, and when pressing one
 *     replaces it with new choices, focus moves to the first new choice.
 *   - The health, magic, experience and rupee counters have spoken names.
 *
 * Announcements go to a status region for TalkBack / VoiceOver and to the
 * game's own voice when that is switched on. All new text is in English,
 * Telugu and Hindi.
 */
(function () {
    'use strict';
    const N = window.Narration;
    if (!N || typeof document === 'undefined') return;

    N.add({
        'sr.t.inventory': ['Inventory', 'సంచి', 'थैला'],
        'sr.t.stats': ['Character stats', 'హీరో వివరాలు', 'नायक का विवरण'],
        'sr.t.map': ['Map', 'పటం', 'नक्शा'],
        'sr.t.quests': ['Quests', 'కార్యాలు', 'कार्य'],
        'sr.t.directory': ['City directory', 'నగర డైరెక్టరీ', 'नगर निर्देशिका'],
        'sr.t.wayfinder': ['Wayfinder', 'దారి సూచిక', 'मार्गदर्शक'],
        'sr.t.shop': ['Shop', 'దుకాణం', 'दुकान'],
        'sr.t.settings': ['Settings', 'సెట్టింగులు', 'सेटिंग्स'],
        'sr.t.social': ['Friends and direct chat', 'స్నేహితులు, నేరుగా చాట్', 'मित्र और सीधी चैट'],
        'sr.t.rooms': ['Chat rooms', 'చాట్ గదులు', 'चैट कक्ष'],
        'sr.t.guild': ['Guild', 'గిల్డ్', 'गिल्ड'],
        'sr.t.notifications': ['Notifications', 'నోటిఫికేషన్లు', 'सूचनाएँ'],
        'sr.t.storage': ['Storage and ground loot', 'నిల్వ, నేల మీది వస్తువులు', 'भंडार और ज़मीन पर पड़ी वस्तुएँ'],
        'sr.t.feedback': ['Send feedback', 'అభిప్రాయం పంపండి', 'सुझाव भेजें'],
        'sr.t.hub': ['Social hub', 'సామాజిక కేంద్రం', 'सामाजिक केंद्र'],
        'sr.t.hall': ['Game Hall', 'ఆటల మందిరం', 'खेल भवन'],
        'sr.t.voice': ['Voice and text commands', 'వాయిస్, టెక్స్ట్ ఆదేశాలు', 'आवाज़ और टेक्स्ट आदेश'],
        'sr.t.menu': ['Menu', 'మెనూ', 'मेन्यू'],
        'sr.hintRead': ['Swipe right to read it.', 'చదవడానికి కుడివైపు స్వైప్ చేయండి.', 'पढ़ने के लिए दाईं ओर स्वाइप करें।'],
        'sr.hintClose': ['The Close button is at the end.', 'మూసివేసే బటన్ చివరలో ఉంది.', 'बंद करने का बटन अंत में है।'],
        'sr.hintGesture': ['Swipe up or down to hear it. Swipe left to close.', 'వినడానికి పైకి లేదా కిందికి స్వైప్ చేయండి. మూసివేయడానికి ఎడమవైపు స్వైప్ చేయండి.', 'सुनने के लिए ऊपर या नीचे स्वाइप करें। बंद करने के लिए बाईं ओर स्वाइप करें।'],
        'sr.closed': ['{title} closed.', '{title} మూసుకుంది.', '{title} बंद हुआ।'],
        'sr.items': ['{n} kinds of items.', '{n} రకాల వస్తువులు ఉన్నాయి.', '{n} तरह की वस्तुएँ हैं।'],
        'sr.items1': ['1 kind of item.', 'ఒక రకం వస్తువు ఉంది.', 'एक तरह की वस्तु है।'],
        'sr.quests1': ['1 quest.', 'ఒక కార్యం ఉంది.', 'एक कार्य है।'],
        'sr.places1': ['1 place to choose from.', 'ఎంచుకోవడానికి ఒక ప్రదేశం ఉంది.', 'चुनने के लिए एक स्थान है।'],
        'sr.items0': ['Your bag is empty.', 'మీ సంచి ఖాళీగా ఉంది.', 'आपका थैला खाली है।'],
        'sr.quests': ['{n} quests.', '{n} కార్యాలు ఉన్నాయి.', '{n} कार्य हैं।'],
        'sr.quests0': ['No quests yet.', 'ఇంకా కార్యాలు లేవు.', 'अभी कोई कार्य नहीं है।'],
        'sr.places': ['{n} places to choose from.', 'ఎంచుకోవడానికి {n} ప్రదేశాలు ఉన్నాయి.', 'चुनने के लिए {n} स्थान हैं।'],
        'sr.forSale': ['{n} things for sale. You have {gold} rupees.', '{n} వస్తువులు అమ్మకానికి ఉన్నాయి. మీ దగ్గర {gold} రూపాయలు ఉన్నాయి.', '{n} वस्तुएँ बिक्री के लिए हैं। आपके पास {gold} रुपये हैं।'],
        'sr.stats': ['Level {level}. Health {hp} of {maxHp}. Magic {mp} of {maxMp}. {gold} rupees.', 'స్థాయి {level}. ఆరోగ్యం {maxHp} లో {hp}. మంత్రశక్తి {maxMp} లో {mp}. {gold} రూపాయలు.', 'स्तर {level}। स्वास्थ्य {maxHp} में से {hp}। जादुई शक्ति {maxMp} में से {mp}। {gold} रुपये।'],
        'sr.actions': ['Actions here: {list}.', 'ఇక్కడ చేయగల పనులు: {list}.', 'यहाँ की क्रियाएँ: {list}।'],
        'sr.actionsWhere': ['The action buttons are after the command box.', 'ఈ పనుల బటన్లు ఆదేశ పెట్టె తర్వాత ఉన్నాయి.', 'इन क्रियाओं के बटन आदेश बॉक्स के बाद हैं।'],
        'sr.actionsLabel': ['Location actions', 'ఇక్కడ చేయగల పనులు', 'यहाँ की क्रियाएँ'],
        'sr.of': ['{a} of {b}', '{b} లో {a}', '{b} में से {a}'],
        'sr.hud.hp': ['Health {v}', 'ఆరోగ్యం {v}', 'स्वास्थ्य {v}'],
        'sr.hud.mp': ['Magic {v}', 'మంత్రశక్తి {v}', 'जादुई शक्ति {v}'],
        'sr.hud.xp': ['Experience {v}', 'అనుభవం {v}', 'अनुभव {v}'],
        'sr.hud.gold': ['{v} rupees', '{v} రూపాయలు', '{v} रुपये'],
        'sr.music': ['Music on or off', 'సంగీతం ఆన్ లేదా ఆఫ్', 'संगीत चालू या बंद']
    });

    const TITLE_KEYS = {
        'inventory-panel': 'sr.t.inventory', 'stats-panel': 'sr.t.stats', 'map-panel': 'sr.t.map', 'quests-panel': 'sr.t.quests',
        'city-directory-panel': 'sr.t.directory', 'wayfinder-panel': 'sr.t.wayfinder', 'shop-panel': 'sr.t.shop',
        'settings-panel': 'sr.t.settings', 'social-panel': 'sr.t.social', 'chat-rooms-panel': 'sr.t.rooms', 'guild-panel': 'sr.t.guild',
        'notifications-panel': 'sr.t.notifications', 'storage-panel': 'sr.t.storage', 'feedback-panel': 'sr.t.feedback',
        'hub-panel': 'sr.t.hub', 'voice-command-panel': 'sr.t.voice', 'game-hall-panel': 'sr.t.hall'
    };

    // Panels whose own code speaks every event through the game voice. The
    // screen reader still gets focus and a name; the game voice is not doubled.
    const SELF_SPEAKING = new Set(['game-hall-panel']);

    const $ = id => document.getElementById(id);
    // Pictures and joiners are noise for a screen reader ("backpack Items").
    const clean = text => String(text || '').replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, ' ').replace(/\s+/g, ' ').trim();
    const shown = element => {
        if (!element || !element.isConnected) return false;
        for (let node = element; node && node !== document; node = node.parentElement) {
            if (node.hidden || node.classList?.contains('hidden')) return false;
            if (node.classList?.contains('screen') && !node.classList.contains('active')) return false;
        }
        return true;
    };
    const isModal = panel => panel.getAttribute('role') === 'dialog' && panel.getAttribute('aria-modal') === 'true';
    const focusables = root => [...root.querySelectorAll('button,input,select,textarea,a[href],[tabindex]')].filter(node => !node.disabled && shown(node));
    const focus = element => { try { element.focus({ preventScroll: false }); } catch { try { element.focus(); } catch { /* not focusable */ } } };
    const gestureMode = () => window.InterfaceMode?.current === 'blind';
    const onGestureSurface = element => Boolean(element?.closest?.('#gesture-interface,#gesture-launch'));

    /* ───────────────────────── announcements ───────────────────────── */

    const api = { history: [], last: '' };
    let clearTimer = null;
    function region() {
        let node = $('sr-announcer');
        if (!node) {
            node = document.createElement('div');
            node.id = 'sr-announcer'; node.className = 'visually-hidden';
            node.setAttribute('role', 'status'); node.setAttribute('aria-live', 'polite'); node.setAttribute('aria-atomic', 'true');
            document.body.appendChild(node);
        }
        return node;
    }
    /**
     * Say something that is not part of the story log. Lines sent in the same
     * moment are joined, because a status region only speaks its latest text.
     */
    let pending = [], pendingVoice = false, flushTimer = null;
    function flush() {
        flushTimer = null;
        const text = pending.join(' '), voice = pendingVoice;
        pending = []; pendingVoice = false;
        if (!text) return;
        const node = region();
        // Empty first so that the same sentence twice in a row is read twice.
        node.textContent = '';
        setTimeout(() => { node.textContent = text; }, 40);
        clearTimeout(clearTimer);
        clearTimer = setTimeout(() => { if (node.textContent === text) node.textContent = ''; }, 10000);
        if (voice) N.speak(text, { channel: 'sr-announce' });
    }
    function announce(text, { voice = true, delay = 0 } = {}) {
        text = clean(text);
        if (!text) return;
        const run = () => {
            pending.push(text); pendingVoice = pendingVoice || voice;
            api.last = text; api.history.push(text);
            if (api.history.length > 30) api.history.shift();
            if (!flushTimer) flushTimer = setTimeout(flush, 60);
        };
        if (delay) setTimeout(run, delay); else run();
    }
    api.announce = announce;

    /* ───────────────────────── panels ───────────────────────── */

    const open = new Map();          // panel -> { opener, title }
    let lastOutside = null;          // last focused control that is not in a panel
    let lastInside = null;           // { panel, element, key, index } for redraws
    let lastPress = null;            // { element, at }: the last button the player pressed
    let scheduled = false;

    function titleOf(panel) {
        const key = TITLE_KEYS[panel.id];
        if (key) return N.t(key);
        const own = panel.dataset.srLabel === 'auto' ? '' : clean(panel.getAttribute('aria-label'));
        return own || clean(panel.querySelector('h2,h3,h4')?.textContent) || N.t('sr.t.menu');
    }

    function detailOf(panel) {
        const G = window.Game, p = G?.state?.player;
        const count = selector => panel.querySelectorAll(selector).length;
        switch (panel.id) {
            case 'inventory-panel': { const n = count('.inv-item'); return n ? N.t(n === 1 ? 'sr.items1' : 'sr.items', { n }) : N.t('sr.items0'); }
            case 'quests-panel': { const n = count('.quest-item'); return n ? N.t(n === 1 ? 'sr.quests1' : 'sr.quests', { n }) : N.t('sr.quests0'); }
            case 'city-directory-panel': { const n = count('#city-directory-list button'); return n ? N.t(n === 1 ? 'sr.places1' : 'sr.places', { n }) : ''; }
            case 'shop-panel': { const n = count('.shop-row,.shop-item-card'); return n && p ? N.t('sr.forSale', { n, gold: p.gold }) : ''; }
            case 'stats-panel': return p ? N.t('sr.stats', { level: p.level, hp: p.hp, maxHp: p.maxHp, mp: p.mp, maxMp: p.maxMp, gold: p.gold }) : '';
            default: return '';
        }
    }

    function describe(panel, title) {
        const hint = gestureMode() ? N.t('sr.hintGesture') : N.t('sr.hintRead') + (panel.querySelector('.close-btn') ? ' ' + N.t('sr.hintClose') : '');
        return [title + '.', detailOf(panel), hint].filter(Boolean).join(' ');
    }

    /** Focus an element and let it carry a full sentence for as long as it is focused. */
    function focusWithLabel(target, line) {
        const before = target.getAttribute('aria-label');
        if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
        target.setAttribute('aria-label', line);
        const restore = () => {
            target.removeEventListener('blur', restore);
            if (before === null) target.removeAttribute('aria-label'); else target.setAttribute('aria-label', before);
        };
        target.addEventListener('blur', restore);
        focus(target);
        if (document.activeElement !== target) restore();
    }

    function onOpen(panel, opener) {
        const title = titleOf(panel);
        open.set(panel, { opener, title });
        if (isModal(panel)) return;                       // modal dialogs already take focus (accessible-dialogs.js)
        if (!panel.getAttribute('role')) panel.setAttribute('role', 'region');
        if ((!panel.hasAttribute('aria-label') && !panel.hasAttribute('aria-labelledby')) || panel.dataset.srLabel === 'auto') {
            panel.setAttribute('aria-label', title); panel.dataset.srLabel = 'auto';
        }
        const voice = !SELF_SPEAKING.has(panel.id);
        const line = describe(panel, title);
        // The panel's own code already put focus on one of its controls: leave it there.
        if (panel.contains(document.activeElement)) { announce(line, { voice }); return; }
        // A typed command leaves the cursor in the command box so the next
        // command can be typed; spoken gesture controls keep their own surface.
        if (opener && (opener.id === 'cmd-input' || onGestureSurface(opener))) { announce(line, { voice }); return; }
        focusWithLabel(panel.querySelector('h2,h3,h4') || panel, line);
        api.last = line; api.history.push(line);
        if (voice) N.speak(line, { channel: 'sr-announce' });
    }

    function onClose(panel, replaced) {
        const info = open.get(panel);
        open.delete(panel);
        if (!info || isModal(panel) || replaced) return;
        const active = document.activeElement;
        if (!active || active === document.body || panel.contains(active) || !shown(active)) {
            const opener = info.opener;
            // Never put the cursor into a text box by ourselves: on a phone that opens the keyboard.
            const usable = opener && shown(opener) && !opener.disabled && !/^(INPUT|TEXTAREA)$/.test(opener.tagName) ? opener : null;
            const target = usable || [$('btn-look-around'), $('btn-where-am-i')].find(shown);
            if (target) focus(target);
        }
        announce(N.t('sr.closed', { title: info.title }), { delay: 350, voice: !SELF_SPEAKING.has(panel.id) });
    }

    /** "Buy" twenty times in a row says nothing: name the item on each row's buttons. */
    function nameRowButtons(panel) {
        for (const row of panel.querySelectorAll('.shop-item-card,.shop-row,.inv-item')) {
            const holder = row.querySelector('strong,.inv-name,.item-name') || row.querySelector('span');
            const own = holder ? [...holder.childNodes].filter(node => node.nodeType === 3).map(node => node.textContent).join(' ') : '';
            const title = clean(clean(own) || holder?.textContent).split(' — ')[0];
            if (!title || title.length > 70) continue;
            for (const button of row.querySelectorAll('button')) {
                const text = clean(button.textContent);
                if (!text || button.hasAttribute('aria-label') || text.toLowerCase().includes(title.toLowerCase())) continue;
                button.setAttribute('aria-label', `${text}: ${title}`);
            }
        }
    }

    const keyOf = element => [element.tagName, element.id, element.getAttribute('onclick') || '', Object.entries(element.dataset || {}).map(pair => pair.join('=')).join('&'), clean(element.textContent).slice(0, 60)].join('|');

    function keepFocus() {
        const kept = lastInside;
        if (!kept || !open.has(kept.panel) || kept.element.isConnected) return;
        const active = document.activeElement;
        if (active && active !== document.body && shown(active)) { lastInside = null; return; }
        const list = focusables(kept.panel);
        const target = list.find(node => keyOf(node) === kept.key) || list[Math.min(kept.index, list.length - 1)] || kept.panel.querySelector('h2,h3,h4');
        if (!target) return;
        if (!target.hasAttribute('tabindex') && !/^(BUTTON|INPUT|SELECT|TEXTAREA|A)$/.test(target.tagName)) target.setAttribute('tabindex', '-1');
        focus(target);
    }

    function scan() {
        scheduled = false;
        const panels = [...document.querySelectorAll('.panel')];
        const visible = panels.filter(shown);
        const closing = [...open.keys()].filter(panel => !visible.includes(panel));
        const opening = visible.filter(panel => !open.has(panel));
        const active = document.activeElement;
        const inherited = closing.map(panel => open.get(panel)?.opener).find(Boolean);
        // The control that was just pressed is the opener even when the screen
        // reader pressed it without moving the cursor out of the command box.
        const pressed = lastPress && Date.now() - lastPress.at < 1500 && lastPress.element.isConnected ? lastPress.element : null;
        for (const panel of closing) onClose(panel, opening.length > 0);
        for (const panel of opening) {
            const inside = node => panel.contains(node) || closing.some(old => old.contains(node));
            let from = pressed || (active && active !== document.body ? active : null);
            if (from && inside(from)) from = inherited || lastOutside;
            if (!from) from = inherited || lastOutside;
            onOpen(panel, from && from.isConnected ? from : null);
        }
        for (const panel of open.keys()) nameRowButtons(panel);
        keepFocus();
    }
    const schedule = () => { if (!scheduled) { scheduled = true; setTimeout(scan, 30); } };
    api.scan = scan;

    document.addEventListener('click', event => {
        const control = event.target?.closest?.('button,a[href],[role="button"],input[type="button"],input[type="submit"]');
        if (control) lastPress = { element: control, at: Date.now() };
    }, true);
    document.addEventListener('keydown', event => { if (event.key === 'Enter' && event.target?.id === 'cmd-input') lastPress = null; }, true);
    document.addEventListener('focusin', event => {
        const target = event.target, panel = target?.closest?.('.panel');
        if (panel && open.has(panel)) lastInside = { panel, element: target, key: keyOf(target), index: focusables(panel).indexOf(target) };
        else { lastInside = null; if (target && target !== document.body) lastOutside = target; }
    });

    /* ───────────────────────── screens, actions, counters ───────────────────────── */

    function screenChanged(id, before) {
        if (!id || id === before || id === 'game-screen') return;   // the game screen speaks through the story log
        const screen = $(id);
        if (!screen || screen.contains(document.activeElement)) return;
        const heading = screen.querySelector('h1,h2,h3');
        if (!heading) return;
        if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
        focus(heading);
    }

    /*
     * The location actions (Pray, Rest, Open shop, prayer choices, quest
     * choices, loot …) are redrawn by many parts of the game. One observer on
     * the box covers all of them:
     *   - if the pressed button disappeared in the redraw, focus goes to the
     *     first new button, so the new choices are right under the finger;
     *   - otherwise a changed set of actions is announced once.
     */
    let lastActions = '', actionTimer = null, toldWhere = false, focusInActions = false, watchedBox = null;
    function actionsChanged() {
        const G = window.Game, box = $('context-actions');
        if (!box || !G?.state) return;
        const buttons = [...box.querySelectorAll('button')].filter(button => !button.disabled);
        const labels = buttons.map(button => clean(button.textContent)).filter(Boolean);
        let heading = clean(box.querySelector('strong')?.textContent).replace(/[:：]\s*$/, '');
        if (/^location actions$/i.test(heading)) heading = '';   // the plain list has its own translated sentence
        const signature = [heading, ...labels].join('|');
        const active = document.activeElement;
        const lostFocus = focusInActions && (!active || active === document.body || !active.isConnected);
        if (lostFocus) {
            focusInActions = false;
            clearTimeout(actionTimer);
            lastActions = signature;
            const target = buttons.find(shown) || [$('btn-look-around'), $('btn-where-am-i')].find(shown);
            if (target) focus(target);
            return;
        }
        if (signature === lastActions) return;
        lastActions = signature;
        clearTimeout(actionTimer);
        if (!labels.length) return;
        actionTimer = setTimeout(() => {
            if (signature !== lastActions || G.state.inCombat || G.state.screen !== 'game-screen' || open.size) return;
            const line = (heading ? heading + ': ' + N.list(labels) + '.' : N.t('sr.actions', { list: N.list(labels) })) + (toldWhere ? '' : ' ' + N.t('sr.actionsWhere'));
            toldWhere = true;
            announce(line, { voice: !gestureMode() });   // spoken gesture controls have their own "context" gesture
        }, 700);
    }
    function watchActions() {
        const box = $('context-actions');
        if (!box || box === watchedBox) return;
        watchedBox = box;
        box.setAttribute('role', 'group');
        box.setAttribute('aria-label', N.t('sr.actionsLabel'));
        box.setAttribute('aria-live', 'off');              // announced once by actionsChanged instead of on every redraw
        box.addEventListener('focusin', () => { focusInActions = true; });
        box.addEventListener('focusout', event => { if (event.relatedTarget) focusInActions = false; });
        new MutationObserver(() => { try { actionsChanged(); } catch (error) { console.warn('action announce:', error); } }).observe(box, { childList: true, subtree: true });
        actionsChanged();
    }

    function labelCounters() {
        const parts = id => String($(id)?.textContent || '').split('/').map(part => part.trim());
        for (const id of ['hp', 'mp', 'xp']) {
            const stat = $(id)?.closest('.stat'), [a, b] = parts(id);
            if (!stat || !a) continue;
            stat.setAttribute('role', 'img');
            stat.setAttribute('aria-label', N.t('sr.hud.' + id, { v: b ? N.t('sr.of', { a, b }) : a }));
        }
        const gold = $('gold')?.closest('.stat');
        if (gold) { gold.setAttribute('role', 'img'); gold.setAttribute('aria-label', N.t('sr.hud.gold', { v: parts('gold')[0] || '0' })); }
        const music = $('btn-hud-music');
        if (music) music.setAttribute('aria-label', N.t('sr.music'));
    }

    function wire() {
        const G = window.Game;
        if (!G || G._screenReaderV756) return;
        G._screenReaderV756 = true;
        region();

        new MutationObserver(schedule).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'hidden'] });
        scan();

        const oldShow = G.showScreen.bind(G);
        G.showScreen = function (id) {
            const before = this.state.screen;
            const result = oldShow(id);
            try { screenChanged(id, before); } catch (error) { console.warn('screen focus:', error); }
            return result;
        };

        watchActions();

        if (typeof G.updateHUD === 'function') {
            const oldHUD = G.updateHUD.bind(G);
            G.updateHUD = function () {
                const result = oldHUD();
                try { labelCounters(); } catch { /* labels are optional */ }
                return result;
            };
        }
        labelCounters();
        window.addEventListener('bsu-language', () => { labelCounters(); const box = $('context-actions'); if (box) box.setAttribute('aria-label', N.t('sr.actionsLabel')); });
    }

    window.ScreenReader = api;
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();
})();
