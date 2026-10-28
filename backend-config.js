/* Public Neon browser configuration. Never put a database password or identity assertion here.
 * When authUrl/dataApiUrl are empty the game runs fully offline with localStorage.
 * After provisioning a Neon project, run `npm run neon:apply-config` to fill these in. */
window.BLACK_SWORD_BACKEND_CONFIG = Object.freeze({
    provider: 'neon',
    authUrl: 'https://ep-hidden-fire-athjwm7w.neonauth.c-9.us-east-1.aws.neon.tech/neondb/auth',
    dataApiUrl: 'https://ep-dark-bread-at1dja9x.apirest.c-9.us-east-1.aws.neon.tech/neondb/rest/v1',
    publicBaseUrl: '',
    authMode: 'redirect',
    googleClientId: '667382471552-n4du4avspd36504ne6226c6mlium6uko.apps.googleusercontent.com',
    /* Neon project: rapid-star-06902365
     * Free-tier: unlimited hours, 0.5 GiB storage, unlimited databases per project.
     * Cloud saves, multiplayer, chat rooms, Game Hall, friend requests, and trading
     * are all active through the Neon Data API and managed Auth. */
    projectId: 'rapid-star-06902365',
    freeTier: true,
    maxStorageGiB: 0.5,
    maxComputeHoursPerMonth: 'unlimited'
});
