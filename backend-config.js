/* Black Sword Ultimate backend configuration.
 * Provider 'firebase': Google sign-in via Firebase (simple, 1-click setup).
 * Provider 'neon': legacy managed auth (complex OAuth, not recommended).
 * Fill in the firebase config after creating your Firebase project. */
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
    // Neon Data API still used for cloud saves, chat, multiplayer.
    dataApiUrl: 'https://ep-dark-bread-at1dja9x.apirest.c-9.us-east-1.aws.neon.tech/neondb/rest/v1',
    authMode: 'popup',
    googleClientId: ''
});
