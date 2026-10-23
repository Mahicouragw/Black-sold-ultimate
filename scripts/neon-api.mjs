/*
 * Minimal Claimable Neon API client shared by the provisioning scripts.
 *
 * Only the short-lived JWT ever leaves this module; the durable identity
 * assertion is used to obtain it and is never printed.
 */
export const API = 'https://claimable.neon.tech/v1';
const RESOURCE = 'https://claimable.neon.tech/';

export async function request(path, { method = 'GET', token, body, form = false } = {}) {
    const response = await fetch(`${API}${path}`, {
        method,
        headers: {
            accept: 'application/json',
            ...(token ? { authorization: `Bearer ${token}` } : {}),
            ...(body ? { 'content-type': form ? 'application/x-www-form-urlencoded' : 'application/json' } : {})
        },
        body: body ? (form ? body.toString() : JSON.stringify(body)) : undefined
    });
    const text = await response.text();
    let result;
    try { result = text ? JSON.parse(text) : {}; } catch { result = { error: { message: 'Neon returned a non-JSON response.' } }; }
    if (!response.ok) {
        const error = new Error(result?.error?.message || `Neon request failed (${response.status}).`);
        error.code = result?.error?.code;
        error.retryable = Boolean(result?.error?.retryable);
        error.status = response.status;
        throw error;
    }
    return result;
}

export async function tokenFor(assertion) {
    if (!assertion) throw new Error('The Neon identity assertion is missing.');
    const body = new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
        resource: RESOURCE
    });
    const result = await request('/oauth2/token', { method: 'POST', body, form: true });
    if (!result.access_token) throw new Error('Neon did not return an access token.');
    return result.access_token;
}
