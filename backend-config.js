/* Black Sword Ultimate backend configuration.
 *
 * Two free services:
 *   - Firebase Authentication signs players in (Google, or a guest account).
 *   - A Supabase project stores the online data (cloud saves, hero names, chat,
 *     chat rooms, friends, guilds, combat groups, feedback). The page reaches it
 *     only through the server function at `dataUrl`.
 *
 * Nothing here is a secret. The values identify the projects; the database key
 * lives only inside the server function, and what each player may read or
 * write is decided by the rules in server/sql/bsu_004_social_rules.sql.
 */
window.BLACK_SWORD_BACKEND_CONFIG = Object.freeze({
    provider: 'firebase',
    firebase: {
        apiKey: "AIzaSyDbxZJZbX2c4Z-6ibJ_Jf0mYhLq_re3fhc",
        authDomain: "black-sword-ultimate-43c4d.firebaseapp.com",
        projectId: "black-sword-ultimate-43c4d",
        storageBucket: "black-sword-ultimate-43c4d.firebasestorage.app",
        messagingSenderId: "672939027677",
        appId: "1:672939027677:web:776a93b7d72f5833b3bf34",
        measurementId: "G-SDY2WG9QT7"
    },
    // Where the online data is read and written (see server/function/bsu-data.ts).
    dataUrl: 'https://tmkpdvljhnlnvbckbnsc.supabase.co/functions/v1/bsu-data',
    // No separate game server: hunger, blessings, quests and board games against
    // the computer are decided on the device.
    gameServerUrl: '',
    authMode: 'popup',
    googleClientId: ''
});
