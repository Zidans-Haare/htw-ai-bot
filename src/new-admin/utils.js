/**
 * Helper function to handle fetch, parse JSON responses, and handle errors.
 * @param {string} url - The URL to fetch.
 * @param {object} options - Fetch options.
 * @returns {Promise<any>} - The parsed JSON response.
 */
export async function fetchAndParse(url, options = {}) {
  const res = await fetch(url, options); // No need to set headers here, overrideFetch does it
  if (!res.ok) {
    let errorMessage;
    try {
      // Try to parse JSON, but handle cases where body might be empty or not JSON
      const errorBody = await res.text();
      if (errorBody) {
        const errorJson = JSON.parse(errorBody);
        errorMessage = errorJson.error || errorJson.message || 'Server error';
      } else {
        errorMessage = `HTTP error ${res.status}`;
      }
    } catch (e) {
      errorMessage = `HTTP error ${res.status} - Could not parse error response.`;
    }
    throw new Error(errorMessage);
  }
  // If response is OK, but has no content, return null.
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

/**
 * Overrides the global fetch to automatically handle 401 Unauthorized errors
 * by redirecting to the login page.
 */
export function overrideFetch() {
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    // Set default headers if they are not present
    if (!init.headers) {
        init.headers = {};
    }
    // Set credentials and Content-Type if not already set
    init.credentials = init.credentials || 'include';
    if (!init.headers['Content-Type'] && !(init.body instanceof FormData)) {
      init.headers['Content-Type'] = 'application/json';
    }

    const res = await originalFetch(input, init);
    if (res.status === 401 || res.status === 403) {
      sessionStorage.removeItem('userRole');
      const redirectTarget = encodeURIComponent(window.location.pathname + window.location.search || '/admin/');
      window.location.href = `/login/?redirect=${redirectTarget}`;
      return res;
    }
    
    // For other errors, we need to be able to read the body again later.
    // So we clone the response. The original response can be read by the caller.
    return res;
  };
}
