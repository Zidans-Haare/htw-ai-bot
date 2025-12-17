const fetch = require('node-fetch'); // Assume installed, or use built-in fetch if Node 18+

/**
 * Checks if a local MCP server process is active by testing the PID.
 * @param {number} pid - Process ID of the server.
 * @returns {boolean} True if process is running, false otherwise.
 */
function checkLocalActive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0); // Signal 0 doesn't kill, just checks existence
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Checks if a remote MCP server is active by sending a JSON-RPC "initialize" request.
 * @param {string} url - MCP endpoint URL (e.g., https://example.com/mcp).
 * @param {object} headers - Headers to include in the request.
 * @param {number} timeout - Timeout in ms.
 * @returns {Promise<boolean>} True if server responds correctly, false otherwise.
 */
async function checkRemoteActive(url, headers = {}, timeout = 10000) {
  if (!url) return false;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        ...headers,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'opencode', version: '1.0' }
        },
      }),
      signal: AbortSignal.timeout(timeout),
    });
    if (!response.ok) return false;
    const data = await response.json();
    return data.jsonrpc === '2.0' && 'id' in data; // Valid JSON-RPC response indicates server is up
  } catch (error) {
    return false;
  }
}

/**
 * Unified function to check MCP server status.
 * @param {object} server - Server object from DB.
 * @returns {Promise<boolean>} Active status.
 */
async function checkServerActive(server) {
  if (server.type === 'local') {
    // Assume PID is stored in process map, but for now return enabled (process check needs PID)
    // In controller, we'll pass PID
    return server.enabled; // Placeholder
  } else if (server.type === 'remote') {
    return await checkRemoteActive(server.url, server.headers, server.timeout);
  }
  return false;
}

module.exports = {
  checkLocalActive,
  checkRemoteActive,
  checkServerActive,
};