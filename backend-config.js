/* Black Sword Ultimate backend configuration.
 *
 * One free Firebase project does everything online: Google sign-in, guest
 * accounts and the Cloud Firestore database (cloud saves, chat, chat rooms,
 * friends, guilds, combat groups, feedback). See FIREBASE_SETUP.md.
 *
 * These values identify the project; they are not secrets. Access to the data
 * is decided by firestore.rules.
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
    // No separate game server: hunger, blessings, quests and board games against
    // the computer are decided on the device.
    gameServerUrl: '',
    authMode: 'popup',
    googleClientId: ''
});
