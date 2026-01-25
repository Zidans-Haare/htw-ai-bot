import { fetchAndParse, overrideFetch } from './utils.js';

export function createApi() {
    overrideFetch();

    return {
        get: async (url) => fetchAndParse(url),
        post: async (url, body) => fetchAndParse(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        }),
        put: async (url, body) => fetchAndParse(url, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        }),
        delete: async (url) => fetchAndParse(url, { method: 'DELETE' }),
    };
}
