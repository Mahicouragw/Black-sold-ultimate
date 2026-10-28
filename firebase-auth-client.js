/* Firebase Authentication for Black Sword Ultimate.
 * Replaces Neon's complex managed auth with Firebase's simple Google sign-in.
 * Firebase handles: anonymous guests, Google OAuth popup, session persistence.
 * Neon Data API still handles: profiles, saves, chat, trading, guilds.
 *
 * Setup (one-time, 5 minutes):
 *   1. Go to https://console.firebase.google.com
 *   2. Create project "Black Sword Ultimate"
 *   3. Authentication > Get Started > Sign-in method > Google > Enable
 *   4. Project settings > Your apps > Web app > copy the firebaseConfig
 *   5. Paste into backend-config.js (auth provider becomes 'firebase')
 */
(() => {
    'use strict';

    // Wait for Firebase SDK to load from CDN.
    function waitForFirebase(cb) {
        if (globalThis.firebase?.auth) return cb();
        const iv = setInterval(() => {
            if (globalThis.firebase?.auth) { clearInterval(iv); cb(); }
        }, 100);
        // Safety: give up after 10s to avoid hanging the page.
        setTimeout(() => clearInterval(iv), 10000);
    }

    function createClient(config) {
        return new Promise((resolve, reject) => {
            waitForFirebase(() => {
                try {
                    if (!globalThis.firebase?.apps?.length) {
                        globalThis.firebase.initializeApp(config.firebase);
                    }
                    const auth = globalThis.firebase.auth();
                    auth.setPersistence(globalThis.firebase.auth.Auth.Persistence.LOCAL);

                    const client = {
                        auth: {
                            async getSession() {
                                return new Promise((res) => {
                                    const unsub = auth.onAuthStateChanged((user) => {
                                        unsub();
                                        res({ data: { session: user ? { user } : null } });
                                    });
                                });
                            },

                            async signInAnonymously(options = {}) {
                                try {
                                    const cred = await auth.signInAnonymously();
                                    if (options?.options?.data?.display_name) {
                                        await cred.user.updateProfile({
                                            displayName: options.options.data.display_name
                                        });
                                    }
                                    return {
                                        data: { session: { user: cred.user }, user: cred.user },
                                        error: null
                                    };
                                } catch (e) {
                                    return { data: { session: null, user: null }, error: e };
                                }
                            },

                            async signInWithOAuth({ provider: _p, options }) {
                                // Firebase Google sign-in: one-line popup.
                                const provider = new globalThis.firebase.auth.GoogleAuthProvider();
                                if (options?.queryParams?.prompt) {
                                    provider.setCustomParameters({ prompt: 'select_account' });
                                }
                                try {
                                    const cred = await auth.signInWithPopup(provider);
                                    return {
                                        data: { session: { user: cred.user }, user: cred.user },
                                        error: null
                                    };
                                } catch (e) {
                                    // User cancelled — not a real error.
                                    if (e.code === 'auth/popup-closed-by-user'
                                        || e.code === 'auth/cancelled-popup-request') {
                                        return { data: { session: null, user: null }, error: null };
                                    }
                                    return { data: { session: null, user: null }, error: e };
                                }
                            },

                            async signOut() {
                                try { await auth.signOut(); return { error: null }; }
                                catch (e) { return { error: e }; }
                            },

                            onAuthStateChange(callback) {
                                return auth.onAuthStateChanged(async (user) => {
                                    await callback('SIGNED_IN', user ? { user } : null);
                                });
                            },

                            async signInWithPassword(_opts) {
                                // Not used in Firebase flow — guest persistence is local.
                                return { data: { session: null, user: null }, error: null };
                            },

                            async signUp(_opts) {
                                // Not used in Firebase flow.
                                return { data: { session: null, user: null }, error: null };
                            }
                        },

                        // Data API client — unchanged, still talks to Neon.
                        from(table) {
                            if (!config.dataApiUrl) {
                                return { select: () => ({ eq: async () => ({ data: [], error: null }),
                                    order: () => ({ limit: async () => ({ data: [], error: null }) }) }) };
                            }
                            return neonRestClient(config.dataApiUrl, table);
                        }
                    };

                    console.log('Firebase Auth: client created');
                    resolve(client);
                } catch (e) {
                    console.error('Firebase init failed:', e);
                    reject(e);
                }
            });
        });
    }

    // Minimal Neon REST client (replaces Supabase-compatible .from().select() etc.)
    function neonRestClient(baseUrl, tableName) {
        let filters = [];
        let orderBy = null;
        let orderAsc = true;
        let limitN = null;

        const chain = {
            select(_cols) { return chain; },
            eq(col, val) { filters.push({ col, val }); return chain; },
            order(col, opts) { orderBy = col; orderAsc = opts?.ascending !== false; return chain; },
            limit(n) { limitN = n; return chain; },
            async then(resolve, reject) {
                try {
                    let url = `${baseUrl}/${tableName}`;
                    const params = [];
                    if (filters.length) params.push(...filters.map(f => `${f.col}=eq.${encodeURIComponent(f.val)}`));
                    if (orderBy) params.push(`order=${orderBy}.${orderAsc ? 'asc' : 'desc'}`);
                    if (limitN) params.push(`limit=${limitN}`);
                    if (params.length) url += '?' + params.join('&');

                    const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
                    const data = await res.json();
                    resolve({ data: Array.isArray(data) ? data : [data], error: null });
                } catch (e) {
                    resolve({ data: [], error: e });
                }
            }
        };
        return chain;
    }

    globalThis.BlackSwordBackend = Object.freeze({
        createClient: (config) => {
            if (config.provider === 'firebase' && config.firebase) {
                return createClient(config);
            }
            // Fallback: no Firebase config — return null so init() handles offline mode.
            return Promise.resolve(null);
        }
    });
})();
