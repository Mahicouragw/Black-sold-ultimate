/* Public Neon browser configuration. Never put a database password or identity assertion here.
 * When authUrl/dataApiUrl are empty the game runs fully offline with localStorage.
 * After provisioning a Neon project, run `npm run neon:apply-config` to fill these in. */
window.BLACK_SWORD_BACKEND_CONFIG = Object.freeze({
    provider: 'neon',
    authUrl: '',
    dataApiUrl: '',
    publicBaseUrl: '',
    authMode: 'redirect',
    googleClientId: '667382471552-n4du4avspd36504ne6226c6mlium6uko.apps.googleusercontent.com',
    /* Free-tier Neon: unlimited hours, 0.5 GiB storage, unlimited databases per project.
     * Claim the project through the GitHub Actions workflow to activate cloud saves,
     * multiplayer, chat rooms, Game Hall, friend requests, and trading. */
    freeTier: true,
    maxStorageGiB: 0.5,
    maxComputeHoursPerMonth: 'unlimited'
});
