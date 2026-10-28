/* Black Sword Ultimate backend configuration.
 * Provider 'firebase': Google sign-in via Firebase (simple, 1-click setup).
 * Provider 'neon': legacy managed auth (complex OAuth, not recommended).
 * Fill in the firebase config after creating your Firebase project. */
window.BLACK_SWORD_BACKEND_CONFIG = Object.freeze({
    provider: 'firebase',
    firebase: {
        apiKey: 'AIzaSyD-PLACEHOLDER-REPLACE-WITH-YOUR-FIREBASE-API-KEY',
        authDomain: 'black-sword-ultimate.firebaseapp.com',
        projectId: 'black-sword-ultimate',
        storageBucket: 'black-sword-ultimate.appspot.com',
        messagingSenderId: '000000000000',
        appId: '1:000000000000:web:abcdef1234567890'
    },
    // Neon Data API still used for cloud saves, chat, multiplayer.
    dataApiUrl: 'https://ep-dark-bread-at1dja9x.apirest.c-9.us-east-1.aws.neon.tech/neondb/rest/v1',
    authMode: 'popup',
    googleClientId: ''
});
