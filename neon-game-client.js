/* Neon Auth + Data API compatibility layer for Black Sword Ultimate. */
(() => {
    'use strict';
    const GUEST_KEY = 'black_sword_neon_guest_v1';
    const CHANNELS = new Set();

    function randomUUID() {
        if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
        const bytes = new Uint8Array(16);
        globalThis.crypto.getRandomValues(bytes);
        bytes[6] = (bytes[6] & 15) | 64;
        bytes[8] = (bytes[8] & 63) | 128;
        const hex = [...bytes].map(value => value.toString(16).padStart(2, '0')).join('');
        return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
    }

    function readGuest() {
        try {
            const value = JSON.parse(localStorage.getItem(GUEST_KEY) || 'null');
            if (value && /^hero-[a-f0-9-]{36}@guest\.black-sword\.local$/.test(value.email) && String(value.password).length >= 40) return value;
        } catch {}
        return null;
    }

    function newGuest() {
        const id = randomUUID();
        return { email: `hero-${id}@guest.black-sword.local`, password: `${randomUUID()}${randomUUID()}` };
    }

    function saveGuest(credentials) {
        try { localStorage.setItem(GUEST_KEY, JSON.stringify(credentials)); } catch {}
    }

    function rowID(row) { return String(row?.id ?? row?.user_id ?? JSON.stringify(row)); }
    function rowTime(row) { return Date.parse(row?.created_at || '') || 0; }

    function pollingChannel(client, name) {
        const watchers = [];
        const channel = {
            name,
            active: false,
            timer: null,
            on(type, config, callback) {
                if (type !== 'postgres_changes' || !config?.table) return channel;
                watchers.push({ config, callback, rows: new Map(), initialized: false, inFlight: false, lastPoll: 0 });
                return channel;
            },
            subscribe(statusCallback) {
                if (channel.active) return channel;
                channel.active = true;
                CHANNELS.add(channel);
                statusCallback?.('SUBSCRIBED');
                queueMicrotask(() => tick(channel));
                return channel;
            },
            stop() {
                channel.active = false;
                clearTimeout(channel.timer);
                channel.timer = null;
                CHANNELS.delete(channel);
            }
        };

        function intervalFor(watcher) {
            if (name.startsWith('hall-')) return 1200;
            if (name.startsWith('room-')) return globalThis.document?.hidden ? 5000 : 2000;
            if (watcher.config.table === 'group_battle_actions') {
                return globalThis.OnlineSystem?.activeCombatGroup ? 1200 : 10000;
            }
            if (watcher.config.table === 'messages') return globalThis.document?.hidden ? 6000 : 2500;
            return 5000;
        }

        async function poll(watcher) {
            if (!channel.active || watcher.inFlight) return;
            const { table, filter, event = '*' } = watcher.config;
            if (table === 'group_battle_actions' && !globalThis.OnlineSystem?.activeCombatGroup) return;
            watcher.inFlight = true;
            try {
                let query = client.from(table).select('*');
                const match = String(filter || '').match(/^([a-zA-Z_][a-zA-Z0-9_]*)=eq\.(.+)$/);
                if (match) query = query.eq(match[1], decodeURIComponent(match[2]));
                if (table !== 'game_hall_sessions') query = query.order('created_at', { ascending: false });
                const { data, error } = await query.limit(table === 'messages' || table === 'chat_room_messages' ? 200 : 100);
                if (error) throw error;
                if (!channel.active) return;
                const rows = Array.isArray(data) ? data : (data ? [data] : []);
                const next = new Map(rows.map(row => [rowID(row), row]));
                if (!watcher.initialized) {
                    watcher.rows = next;
                    watcher.initialized = true;
                    return;
                }
                const previous = watcher.rows;
                const added = rows.filter(row => !previous.has(rowID(row))).sort((a, b) => rowTime(a) - rowTime(b));
                const changed = rows.filter(row => previous.has(rowID(row)) && JSON.stringify(previous.get(rowID(row))) !== JSON.stringify(row));
                const removed = [...previous.entries()].filter(([id]) => !next.has(id)).map(([, row]) => row);
                watcher.rows = next;
                const emit = async (eventType, current, old) => {
                    if (event !== '*' && event !== eventType) return;
                    try { await watcher.callback({ eventType, schema: 'public', table, new: current || null, old: old || null }); }
                    catch (callbackError) { console.warn(`Neon ${table} synchronization callback:`, callbackError?.message || callbackError); }
                };
                for (const row of added) await emit('INSERT', row, null);
                for (const row of changed) await emit('UPDATE', row, previous.get(rowID(row)));
                for (const row of removed) await emit('DELETE', null, row);
            } catch (error) {
                // Keep the last good snapshot. A transient failure must never be
                // mistaken for deletion of every visible message or session.
                console.warn(`Neon ${table} synchronization delayed:`, error?.message || error);
            } finally {
                watcher.inFlight = false;
                watcher.lastPoll = Date.now();
            }
        }

        async function tick(target) {
            if (!target.active) return;
            const now = Date.now();
            await Promise.all(watchers.filter(watcher => now - watcher.lastPoll >= intervalFor(watcher)).map(poll));
            if (target.active) target.timer = setTimeout(() => tick(target), 500);
        }
        return channel;
    }

    function createClient(config) {
        if (!globalThis.NeonBackend?.createClient || !globalThis.NeonBackend?.SupabaseAuthAdapter) {
            throw new Error('Neon browser SDK is unavailable');
        }
        if (!config?.authUrl || !config?.dataApiUrl) throw new Error('Neon backend is not configured');
        const client = globalThis.NeonBackend.createClient({
            auth: { url: config.authUrl, adapter: globalThis.NeonBackend.SupabaseAuthAdapter() },
            dataApi: { url: config.dataApiUrl }
        });
        const auth = client.auth;
        const signOut = auth.signOut.bind(auth);
        auth.signInAnonymously = async (options = {}) => {
            const existing = readGuest();
            const credentials = existing || newGuest();
            const displayName = options?.options?.data?.display_name || options?.options?.data?.displayName || 'Wandering Hero';
            let result = await auth.signUp({
                email: credentials.email,
                password: credentials.password,
                options: { data: { displayName } }
            });
            if (result.error && (existing || /already|exist|duplicate/i.test(result.error.message || ''))) {
                result = await auth.signInWithPassword({ email: credentials.email, password: credentials.password });
            }
            if (!result.error && result.data?.session?.user) saveGuest(credentials);
            return result;
        };
        auth.signOut = async (...args) => {
            const result = await signOut(...args);
            try { localStorage.removeItem(GUEST_KEY); } catch {}
            return result;
        };
        client.channel = name => pollingChannel(client, String(name));
        client.removeChannel = async channel => { channel?.stop?.(); return { error: null }; };
        return client;
    }

    globalThis.BlackSwordBackend = Object.freeze({ createClient });
    globalThis.addEventListener?.('pagehide', () => { for (const channel of CHANNELS) channel.stop(); });
})();
