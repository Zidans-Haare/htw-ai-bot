const { prisma } = require('../controllers/db.cjs');
const fetch = require('node-fetch');
const { spawn } = require('child_process');

// Store active MCP server processes
const activeProcesses = new Map();

/**
 * Fetches available tools from all enabled MCP servers.
 * @returns {Promise<Array>} Array of tool objects formatted for OpenAI, with server info.
 */
async function getMcpTools() {
  const servers = await prisma.mcpServer.findMany({ where: { enabled: true } });
  const tools = [];

  for (const server of servers) {
    try {
      const serverTools = await fetchServerTools(server);
      for (const tool of serverTools) {
        tools.push({
          serverId: server.id,
          server,
          tool: {
            type: 'function',
            function: {
              name: `${server.name}_${tool.name}`.replace(/\s+/g, '_'), // Unique name
              description: tool.description || '',
              parameters: tool.inputSchema || {},
            },
          },
        });
      }
    } catch (error) {
      console.error(`Failed to fetch tools from ${server.name}:`, error);
    }
  }

  return tools;
}

/**
 * Sends a JSON-RPC request to a stdio MCP server and waits for response.
 * @param {object} server - Server config.
 * @param {object} request - JSON-RPC request object.
 * @returns {Promise<object>} JSON-RPC response.
 */
async function sendStdioRequest(server, request) {
  const processKey = `server_${server.id}`;

  // Start process if not running
  if (!activeProcesses.has(processKey)) {
    if (!server.command || !Array.isArray(server.command) || server.command.length === 0) {
      throw new Error(`No command configured for local MCP server ${server.name}`);
    }

    const [cmd, ...args] = server.command;
    const child = spawn(cmd, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...server.env },
    });

    activeProcesses.set(processKey, {
      process: child,
      pendingRequests: new Map(),
      requestId: 1,
    });

    // Handle stdout
    let buffer = '';
    child.stdout.on('data', (data) => {
      buffer += data.toString();
      let lines = buffer.split('\n');
      buffer = lines.pop(); // Keep incomplete line

      for (const line of lines) {
        if (line.trim()) {
          try {
            const response = JSON.parse(line.trim());
            const pending = activeProcesses.get(processKey).pendingRequests.get(response.id);
            if (pending) {
              pending.resolve(response);
              activeProcesses.get(processKey).pendingRequests.delete(response.id);
            }
          } catch (error) {
            console.error(`Failed to parse MCP response from ${server.name}:`, error);
          }
        }
      }
    });

    // Handle stderr for logging
    child.stderr.on('data', (data) => {
      console.error(`MCP server ${server.name} stderr:`, data.toString());
    });

    // Handle process exit
    child.on('exit', (code) => {
      console.log(`MCP server ${server.name} exited with code ${code}`);
      activeProcesses.delete(processKey);
    });

    // Wait a bit for server to initialize
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  const processInfo = activeProcesses.get(processKey);
  const requestId = processInfo.requestId++;

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      processInfo.pendingRequests.delete(requestId);
      reject(new Error(`Request timeout for MCP server ${server.name}`));
    }, server.timeout || 10000);

    processInfo.pendingRequests.set(requestId, {
      resolve: (response) => {
        clearTimeout(timeout);
        resolve(response);
      },
      reject: (error) => {
        clearTimeout(timeout);
        reject(error);
      },
    });

    const fullRequest = { ...request, id: requestId };
    processInfo.process.stdin.write(JSON.stringify(fullRequest) + '\n');
  });
}

/**
 * Fetches tools from a single MCP server via JSON-RPC tools/list.
 * @param {object} server - Server config.
 * @returns {Promise<Array>} List of tools.
 */
async function fetchServerTools(server) {
  if (server.type === 'remote') {
    const response = await fetch(server.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        ...server.headers,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
        params: {},
      }),
      signal: AbortSignal.timeout(server.timeout || 10000),
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();
    if (data.error) throw new Error(data.error.message);
    return data.result.tools || [];
  } else if (server.type === 'local') {
    // Handle local servers via stdio
    const response = await sendStdioRequest(server, {
      jsonrpc: '2.0',
      method: 'tools/list',
      params: {},
    });

    if (response.error) throw new Error(response.error.message);
    return response.result.tools || [];
  }

  return [];
}

/**
 * Executes a tool call on the appropriate MCP server.
 * @param {object} toolCall - From AI response, {id, function: {name, arguments}}
 * @param {Array} tools - From getMcpTools, to find server.
 * @returns {Promise<object>} Tool result {content, tool_call_id}
 */
async function executeMcpTool(toolCall, tools) {
  const toolName = toolCall.function.name;
  const tool = tools.find(t => t.tool.function.name === toolName);
  if (!tool) throw new Error(`Tool ${toolName} not found`);

  const { server } = tool;
  const args = JSON.parse(toolCall.function.arguments);

  // Debug: show what name will be sent to the MCP server
  const serverNameNormalized = server.name.replace(/\s+/g, '_');
  console.log(`Server name: "${server.name}" -> normalized: "${serverNameNormalized}"`);
  console.log(`Tool name to clean: "${toolCall.function.name}"`);
  const cleanToolName = toolCall.function.name.replace(`${serverNameNormalized}_`, '');
  console.log(`After replacement: "${cleanToolName}"`);
  console.log(`Sending tool call to ${server.name} MCP server: "${cleanToolName}" (original: "${toolName}")`);

  let response;
  if (server.type === 'remote') {
    response = await fetch(server.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        ...server.headers,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: cleanToolName,
          arguments: args,
        },
      }),
      signal: AbortSignal.timeout(server.timeout || 10000),
    });

    if (!response.ok) throw new Error(`Tool call failed: HTTP ${response.status}`);

    response = await response.json();
  } else if (server.type === 'local') {
    // Handle local servers via stdio
    response = await sendStdioRequest(server, {
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: cleanToolName,
        arguments: args,
      },
    });
  } else {
    throw new Error(`Unsupported server type: ${server.type}`);
  }

  if (response.error) throw new Error(response.error.message);

  return {
    content: JSON.stringify(response.result),
    tool_call_id: toolCall.id,
  };
}

// Cleanup function to terminate all MCP server processes
function cleanupMcpServers() {
  for (const [key, processInfo] of activeProcesses) {
    try {
      processInfo.process.kill('SIGTERM');
      console.log(`Terminated MCP server process: ${key}`);
    } catch (error) {
      console.error(`Error terminating MCP server ${key}:`, error);
    }
  }
  activeProcesses.clear();
}

// Handle application shutdown
process.on('SIGINT', cleanupMcpServers);
process.on('SIGTERM', cleanupMcpServers);

module.exports = {
  getMcpTools,
  executeMcpTool,
  cleanupMcpServers,
};
