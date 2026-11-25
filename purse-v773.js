/**
 * 7.73.0 — the purse.
 *
 * The owner asked for an economy that is presented properly: every coin of the
 * game in one place, each with what it actually buys, and the honest sources of
 * the rarest one. Diamonds are the estate currency, the rune currency and the
 * incense currency; a player should be able to see that without hunting through
 * six panels.
 *
 * The panel is drawn into the shop panel the rest of the game already uses, so
 * it inherits the same styling, the same close button and the same screen-reader
 * reading order. Nothing here changes a price: it only shows what is true.
 */
(() => {
    'use strict';
    const w = window, G = w.Game;
    if (!G) return;

    const COINS = [
        {
            key: 'diamonds', icon: '💎', label: 'Diamonds',
            line: 'The rarest money in the world. A deed, a sign, or a twist of incense.',
            buys: 'Deeds 100–300 · signs 6–22 · incense 3'
        },
        {
            key: 'gold', icon: '🪙', label: 'Rupees',
            line: 'Everyday money: market stalls, decorations, ferries.',
            buys: 'Goods, decorations, travel'
        },
        {
            key: 'rubies', icon: '🔴', label: 'Rubies',
            line: 'A red stone for the ones who fell beside you.',
            buys: 'Revives one companion to three-fifths'
        },
        {
            key: 'goldRubies', icon: '🟡', label: 'Gold rubies',
            line: 'A better red stone; the whole group stands up again.',
            buys: 'Revives the whole group to full'
        }
    ];

    const num = value => Number(value || 0).toLocaleString('en-IN');

    /** Where the rarest coin comes from, written as the world would say it. */
    function diamondSources(game) {
        const rows = [
            'A great beast, or the beast at the end of the row, sometimes leaves one in the spoils.',
            'The Arena counts them out at every twenty-fifth wave.',
            'Behind the Christmas doors, in Santa’s sack, and at the foot of the Grand Christmas Tree when it is finished for the night.',
            'The twelfth-night bounty board pays in them for the frost-prowlers.',
            'Nobody sells a diamond for rupees. The estate agent takes them for a deed, the rune shop for its signs, and the Wrapped Parcel asks for them across its counter.'
        ];
        const due = typeof game.houseDueNow === 'function' ? game.houseDueNow() : 0;
        if (due) rows.push(`The estate agent is owed ${num(due)} diamond${due === 1 ? '' : 's'} this month.`);
        return rows;
    }

    Game.showPurse = function () {
        const p = this.state.player;
        if (!p) { this.addNarrative('Create a hero first.', 'system'); return false; }
        const panel = document.getElementById('shop-panel'), content = document.getElementById('shop-content');
        if (!panel || !content) return false;
        const cards = COINS.map(coin => `
            <article class="purse-card">
                <div class="purse-amount"><span class="purse-icon" aria-hidden="true">${coin.icon}</span><strong>${num(p[coin.key])}</strong></div>
                <div class="purse-text"><strong>${this.escapeHTML(coin.label)}</strong><p>${this.escapeHTML(coin.line)}</p><small>${this.escapeHTML(coin.buys)}</small></div>
            </article>`).join('');
        const sources = diamondSources(this).map(line => `<li>${this.escapeHTML(line)}</li>`).join('');
        const smoke = typeof this.luckBonus === 'function' && this.luckBonus() > 0
            ? '<p class="purse-note">Smoke is still hanging about you: the world is a little kinder to your luck just now.</p>' : '';
        content.innerHTML = `
            <div class="shop-summary"><strong>The Purse</strong><span>${this.escapeHTML(p.name || 'Hero')} • level ${num(p.level || 1)}</span><button onclick="Game.showWallet()">Say the old purse line</button></div>
            <div class="purse-grid">${cards}</div>
            ${smoke}
            <h4>Where diamonds come from</h4>
            <ul class="purse-sources">${sources}</ul>
            <div class="shop-actions">
                <button onclick="Game.showRuneShop()">Rune shop</button>
                <button onclick="Game.housesForSale()">Houses for sale</button>
                <button onclick="Game.showGiftShop()">Gift shop</button>
                <button onclick="document.getElementById('shop-panel').classList.add('hidden')">Close</button>
            </div>`;
        panel.classList.remove('hidden');
        this.lastPurseShownAt = Date.now();
        return true;
    };

    const oldCommand = G.processCommand;
    G.processCommand = function (raw) {
        const text = String(raw || '').trim().toLowerCase().replace(/\s+/g, ' ');
        if (text === 'purse' || text === 'wallet' || text === 'money' || text === 'coins' || text === 'currency') {
            this.showPurse();
            return;
        }
        oldCommand.call(this, raw);
    };

    window.Purse = { coins: COINS, sources: diamondSources, open: () => G.showPurse() };
})();
