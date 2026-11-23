/**
 * 7.63.0 — the game is played online only.
 *
 * The owner asked for an online-only game: no internet, no play. This module is
 * the gate. It never deletes a hero or a save; it only pauses input, says why,
 * and takes the player straight back in when the connection returns.
 *
 * Everything is announced through the same screen-reader path the rest of the
 * game uses, and the panel is a real dialog with one Retry button so a player
 * who cannot see the screen is never trapped.
 */
(() => {
    'use strict';

    const RETRY_MS = 5000;
    const SPEAK_GAP_MS = 4000;

    let blocked = false;
    let lastSpoken = 0;
    let panel = null;
    let hidChooser = false;
    let focusedBefore = null;
    let retryTimer = null;
    let installed = false;

    const en = (english, telugu, hindi) => {
        const lang = window.Narration?.lang?.() || 'en';
        return lang === 'te' ? telugu : lang === 'hi' ? hindi : english;
    };

    const line = () => en(
        'The Black Sword needs an internet connection. Connect to Wi-Fi or mobile data and choose Retry.',
        'బ్లాక్ స్వోర్డ్ ఆటకు ఇంటర్నెట్ కనెక్షన్ కావాలి. వై-ఫై లేదా మొబైల్ డేటాకు కనెక్ట్ అయి, మళ్లీ ప్రయత్నించండి అనే బటన్ నొక్కండి.',
        'ब्लैक स्वॉर्ड के लिए इंटरनेट कनेक्शन आवश्यक है। वाई-फ़ाई या मोबाइल डेटा से जुड़ें और फिर से प्रयास करें दबाएँ।'
    );
    const backLine = () => en(
        'Internet is back. You can play again.',
        'ఇంటర్నెట్ తిరిగి వచ్చింది. మీరు మళ్లీ ఆడవచ్చు.',
        'इंटरनेट वापस आ गया। आप फिर खेल सकते हैं।'
    );

    const hasNetwork = () => {
        try {
            if (typeof navigator === 'undefined' || navigator.onLine === false) return false;
        } catch { return false; }
        return true;
    };

    const speak = (text, focus = false) => {
        try {
            if (window.GestureAccessibility?.speak) window.GestureAccessibility.speak(text, focus, 'system');
            else if (window.Narration?.say) window.Narration.say(text, 'system');
            else if (window.Game?.addNarrative) window.Game.addNarrative(text, 'system');
        } catch { /* narration is optional */ }
    };

    const announce = (text, force = false) => {
        const now = Date.now();
        if (!force && now - lastSpoken < SPEAK_GAP_MS) return;
        lastSpoken = now;
        // Never let the spoken notice move focus: this dialog owns focus and
        // always leaves it on Retry.
        speak(text, false);
    };

    function buildPanel() {
        if (panel || typeof document === 'undefined') return panel;
        const box = document.createElement('div');
        box.id = 'online-required';
        box.setAttribute('role', 'alertdialog');
        box.setAttribute('aria-modal', 'true');
        box.setAttribute('aria-labelledby', 'online-required-title');
        box.setAttribute('aria-describedby', 'online-required-text');
        box.style.cssText = [
            'position:fixed', 'inset:0', 'z-index:100000', 'display:none',
            'align-items:center', 'justify-content:center', 'padding:24px',
            'background:rgba(8,6,18,0.96)', 'color:#f5f1ff',
            'font:16px/1.5 system-ui, sans-serif', 'text-align:center'
        ].join(';');
        box.innerHTML = `
            <div style="max-width:34rem">
                <h2 id="online-required-title" style="margin:0 0 12px;font-size:1.4rem">🌐 Internet required</h2>
                <p id="online-required-text" style="margin:0 0 20px"></p>
                <button id="online-required-retry" type="button"
                    style="font:inherit;padding:14px 22px;border-radius:12px;border:0;background:#e9d8a6;color:#241b0b;font-weight:700">
                    Retry
                </button>
                <p style="margin:16px 0 0;opacity:.75;font-size:.9rem">Your hero and progress are safe and stay exactly as they were.</p>
            </div>`;
        document.body.appendChild(box);
        box.querySelector('#online-required-retry').addEventListener('click', retryNow);
        // The notice is modal: while it is open, focus belongs on Retry and
        // nowhere else, even if another start-up panel asks for focus.
        let refocusing = false;
        document.addEventListener('focusin', event => {
            if (!blocked || refocusing || !panel) return;
            if (panel.contains(event.target)) return;
            const retry = panel.querySelector('#online-required-retry');
            if (!retry) return;
            refocusing = true;
            try { retry.focus({ preventScroll: true }); } catch { /* ignore */ }
            finally { refocusing = false; }
        }, true);
        panel = box;
        return panel;
    }

    function fillPanel() {
        const box = buildPanel();
        if (!box) return;
        const text = box.querySelector('#online-required-text');
        if (text) text.textContent = line();
        const title = box.querySelector('#online-required-title');
        if (title) title.textContent = en('Internet required', 'ఇంటర్నెట్ అవసరం', 'इंटरनेट आवश्यक है');
        const retry = box.querySelector('#online-required-retry');
        if (retry) retry.textContent = en('Retry', 'మళ్లీ ప్రయత్నించండి', 'फिर से प्रयास करें');
    }

    /* A first-run interface chooser can be open when the connection drops. It
       would sit over this notice and pull focus back to itself, so it waits
       behind the connection gate and returns when the gate opens. */
    function pauseStartupChooser() {
        const dialog = document.getElementById('interface-mode-dialog');
        if (!dialog || dialog.classList.contains('hidden')) return;
        dialog.classList.add('hidden');
        hidChooser = true;
    }

    function resumeStartupChooser() {
        if (!hidChooser) return;
        hidChooser = false;
        document.getElementById('interface-mode-dialog')?.classList.remove('hidden');
    }

    function show(announceIt = true) {
        if (!blocked) {
            const active = document.activeElement;
            focusedBefore = active && active !== document.body ? active : null;
        }
        blocked = true;
        pauseStartupChooser();
        fillPanel();
        if (panel) {
            panel.style.display = 'flex';
            const retry = panel.querySelector('#online-required-retry');
            const focusRetry = () => { try { retry?.focus({ preventScroll: true }); } catch { /* old browsers */ } };
            focusRetry();
            // Another start-up panel may try to take focus in the same turn; the
            // connection notice must win, so it focuses again just after.
            setTimeout(focusRetry, 80);
        }
        if (announceIt) announce(line(), true);
        startRetryLoop();
        notifyBlocking();
    }

    function hide(announceIt = true) {
        blocked = false;
        if (retryTimer) { clearInterval(retryTimer); retryTimer = null; }
        if (panel) panel.style.display = 'none';
        resumeStartupChooser();
        // Put the player back where they were before the notice appeared.
        const restore = focusedBefore;
        focusedBefore = null;
        if (restore && restore.isConnected && !panel?.contains(restore)) {
            try { restore.focus({ preventScroll: true }); } catch { /* ignore */ }
        }
        notifyBlocking();
        if (announceIt) {
            lastSpoken = 0;
            announce(backLine(), true);
            // Resume the hero the player had open, exactly as a reload would.
            if (window.Game && !window.Game.state?.location) {
                try { window.Game.autoResumeIfActive?.(); } catch { /* nothing to resume */ }
            }
        }
    }

    function notifyBlocking() {
        document.documentElement?.classList.toggle('online-required', blocked);
        document.body?.classList.toggle('online-required', blocked);
    }

    function startRetryLoop() {
        if (retryTimer) return;
        retryTimer = setInterval(() => {
            if (hasNetwork()) hide(true);
        }, RETRY_MS);
    }

    function retryNow() {
        if (hasNetwork()) {
            hide(true);
            return;
        }
        announce(en(
            'Still offline. Check Wi-Fi or mobile data, then choose Retry again.',
            'ఇంకా ఆఫ్‌లైన్‌లో ఉంది. వై-ఫై లేదా మొబైల్ డేటా చూసి, మళ్లీ ప్రయత్నించండి నొక్కండి.',
            'अभी भी ऑफ़लाइन है। वाई-फ़ाई या मोबाइल डेटा जाँचें, फिर प्रयास करें दबाएँ।'
        ), true);
        if (panel) {
            const retry = panel.querySelector('#online-required-retry');
            try { retry?.focus({ preventScroll: true }); } catch { /* ignore */ }
        }
    }

    /* Input stops while the gate is closed. Every path a player can reach —
       typed command, swipe, spell, prayer, palace quest — goes through one of
       these, so nothing is half-played while the connection is gone. */
    const blockedReply = () => {
        announce(line(), false);
        return false;
    };

    function wrap(G, name, after = null) {
        const original = G?.[name];
        if (typeof original !== 'function') return;
        G[name] = function (...args) {
            if (blocked) return blockedReply();
            const result = original.apply(this, args);
            if (typeof after === 'function') after.call(this, result);
            return result;
        };
    }

    function install(G) {
        if (installed || !G) return;
        installed = true;
        for (const name of ['processCommand', 'move', 'castSpell', 'pray', 'palaceQuest', 'useItem', 'take', 'look', 'interact']) wrap(G, name);
        const originalSave = G.save;
        if (typeof originalSave === 'function') {
            // A save is never thrown away while offline; it simply waits.
            G.save = function (...args) {
                if (blocked) return false;
                return originalSave.apply(this, args);
            };
        }
    }

    function check({ announceIt = true } = {}) {
        if (!hasNetwork()) { show(announceIt); return false; }
        if (blocked) hide(announceIt);
        return true;
    }

    function init() {
        install(window.Game);
        check({ announceIt: true });
        window.addEventListener('offline', () => { show(true); });
        window.addEventListener('online', () => { check({ announceIt: true }); });
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && blocked && hasNetwork()) hide(true);
        });
    }

    window.OnlineRequired = {
        get blocked() { return blocked; },
        check: () => check(),
        retry: retryNow,
        line,
        install
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
})();
